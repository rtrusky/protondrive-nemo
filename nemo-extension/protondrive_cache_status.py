"""
Nemo extension showing whether each file/folder under the Proton Drive
mount has its content locally cached (decrypted on disk already) or would
need a fresh download from Drive on open. Queries the running mount
daemon's IPC socket (see src/ipcServer.ts, op "cacheStatus") directly over
a local Unix socket — no dependency on `node` being on Nemo's PATH.

Two independent ways of surfacing the same data:
  - An emblem overlay on the icon (Icon View and List View). Nemo has a
    confirmed upstream bug where this silently fails to draw on a file
    whose real thumbnail renders smaller than the emblem — see
    https://github.com/linuxmint/nemo/issues/2875. Nothing we can do about
    that from here, so...
  - A plain "Proton Drive Cache" text column, opt-in via List View's
    "Visible Columns" preferences — unaffected by the emblem bug since
    it's just a table cell, not composited onto the thumbnail.

Installed by ../scripts/install-nemo-cache-emblems.sh into
~/.local/share/nemo-python/extensions/.
"""

import json
import os
import socket
import threading
import time

import gi

gi.require_version('Nemo', '3.0')
from gi.repository import GLib, GObject, Nemo  # noqa: E402

MOUNT_POINT = os.environ.get('PROTONDRIVE_NEMO_MOUNT_POINT') or os.path.join(os.path.expanduser('~'), 'ProtonDrive')
_CACHE_DIR = os.environ.get('PROTONDRIVE_NEMO_DATA_DIR') or os.path.join(
    os.environ.get('XDG_CACHE_HOME') or os.path.join(os.path.expanduser('~'), '.cache'), 'protondrive-nemo'
)
SOCKET_PATH = os.path.join(_CACHE_DIR, 'daemon.sock')

# Suffixes of the emblem-protondrive-<suffix> icons installed alongside this
# file (Nemo's add_emblem() takes the name without the "emblem-" prefix).
EMBLEMS = {
    'cached': 'protondrive-cached',
    'not-cached': 'protondrive-notcached',
    'partial': 'protondrive-partial',
}

# Text shown in the opt-in "Proton Drive Cache" list-view column. 'unknown'
# and anything absent from cacheStatus's response deliberately map to '' —
# an explicit "we don't know" label would read as more confident than the
# 1.2s recursive lookup actually is.
COLUMN_LABELS = {
    'cached': 'Cached',
    'not-cached': 'Not cached',
    'partial': 'Partially cached',
}

# One socket round-trip covers every file Nemo shows in a given folder view
# (see cacheStatus in ipcServer.ts), cached here for a while so scrolling or
# re-rendering the same folder doesn't re-hit the daemon. Comfortably above
# the daemon's own ~1.2s worst-case deadline for a cold/deep folder.
FOLDER_TTL_SECONDS = 8
# A failed/timed-out query gets cached only this briefly, not for the full
# TTL above — otherwise one slow query blip poisons every file Nemo happens
# to check during that window with "no data" (silently no badge) for a
# full 8 seconds instead of retrying almost immediately.
FAILURE_TTL_SECONDS = 3
SOCKET_TIMEOUT_SECONDS = 2.0

# Nemo generates real image/PDF thumbnails asynchronously and swaps the new
# pixbuf in without re-compositing an emblem added earlier — confirmed by
# testing with thumbnails off (emblem shows) vs on (emblem vanishes) for the
# exact same cached file. Re-invalidating a file's extension info once,
# this long after we first set its emblem, prompts Nemo to ask again and
# re-add it once the thumbnail has (almost certainly) already settled.
THUMBNAIL_SETTLE_SECONDS = 3


def _query_folder(fuse_folder_path):
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(SOCKET_TIMEOUT_SECONDS)
        s.connect(SOCKET_PATH)
        s.sendall((json.dumps({'op': 'cacheStatus', 'path': fuse_folder_path}) + '\n').encode('utf-8'))
        buf = b''
        while b'\n' not in buf:
            chunk = s.recv(1 << 16)
            if not chunk:
                break
            buf += chunk
        s.close()
        resp = json.loads(buf.decode('utf-8'))
        if resp.get('ok'):
            return resp.get('entries', {})
    except OSError:
        pass  # Daemon not running / socket gone — fail silently, no emblems.
    except ValueError:
        pass  # Malformed/partial JSON.
    return {}


class ProtonDriveCacheStatus(GObject.GObject, Nemo.InfoProvider, Nemo.ColumnProvider):
    def get_columns(self):
        return [Nemo.Column(
            name='ProtonDriveCacheStatus::cache_status_column',
            attribute='protondrive_cache_status',
            label='Proton Drive Cache',
            description="Whether this item's content is downloaded and decrypted locally",
        )]

    def __init__(self):
        super().__init__()
        # fuse folder path -> (entries dict, fetched_at, was_successful)
        self._folder_cache = {}
        # fuse folder path -> {file name -> NemoFileInfo}, for files whose
        # update_file_info ran before we had (or had stale) data for their
        # folder, so we can invalidate_extension_info() them once real data
        # lands instead of leaving them permanently blank.
        self._pending_files = {}
        self._global_lock = threading.Lock()
        self._folder_locks = {}
        # (fuse folder path, name) already scheduled for a post-thumbnail
        # emblem re-check, so we only schedule it once per file per view.
        self._thumbnail_recheck_scheduled = set()

    def _to_fuse_path(self, local_path):
        real = os.path.realpath(local_path)
        mount = os.path.realpath(MOUNT_POINT)
        if real != mount and not real.startswith(mount + os.sep):
            return None
        rel = '' if real == mount else real[len(mount):]
        return '/' + rel.strip('/').replace(os.sep, '/')

    def _lock_for(self, fuse_folder):
        with self._global_lock:
            lock = self._folder_locks.get(fuse_folder)
            if lock is None:
                lock = threading.Lock()
                self._folder_locks[fuse_folder] = lock
            return lock

    def _fresh_cached_entries(self, fuse_folder):
        cached = self._folder_cache.get(fuse_folder)
        if cached is None:
            return None
        entries, fetched_at, ok = cached
        ttl = FOLDER_TTL_SECONDS if ok else FAILURE_TTL_SECONDS
        return entries if time.time() - fetched_at <= ttl else None

    def _entries_for(self, fuse_folder):
        entries = self._fresh_cached_entries(fuse_folder)
        if entries is not None:
            return entries

        # Only one thread actually queries per folder at a time; others
        # (whether genuinely concurrent or just arriving moments later)
        # wait for that result instead of firing their own redundant query.
        with self._lock_for(fuse_folder):
            entries = self._fresh_cached_entries(fuse_folder)
            if entries is not None:
                return entries

            entries = _query_folder(fuse_folder)
            ok = bool(entries)
            self._folder_cache[fuse_folder] = (entries, time.time(), ok)
            if ok:
                self._wake_pending_files(fuse_folder)
            return entries

    def _wake_pending_files(self, fuse_folder):
        for pending_file in self._pending_files.pop(fuse_folder, {}).values():
            pending_file.invalidate_extension_info()

    def update_file_info(self, file):
        location = file.get_location()
        local_path = location.get_path() if location else None
        if not local_path:
            return Nemo.OperationResult.COMPLETE

        fuse_folder = self._to_fuse_path(os.path.dirname(local_path))
        if fuse_folder is None:
            return Nemo.OperationResult.COMPLETE

        name = os.path.basename(local_path)
        entries = self._entries_for(fuse_folder)
        if name not in entries:
            # No data (yet) for this specific file — remember it so a
            # later successful fetch for this folder can prompt Nemo to
            # ask again, instead of it staying blank until manual refresh.
            self._pending_files.setdefault(fuse_folder, {})[name] = file

        state = entries.get(name)
        file.add_string_attribute('protondrive_cache_status', COLUMN_LABELS.get(state, ''))

        emblem = EMBLEMS.get(state)
        if emblem:
            file.add_emblem(emblem)
            recheck_key = (fuse_folder, name)
            if recheck_key not in self._thumbnail_recheck_scheduled:
                self._thumbnail_recheck_scheduled.add(recheck_key)
                GLib.timeout_add_seconds(THUMBNAIL_SETTLE_SECONDS, self._recheck_after_thumbnail, file, recheck_key)
        return Nemo.OperationResult.COMPLETE

    def _recheck_after_thumbnail(self, file, recheck_key):
        # Deliberately leave recheck_key in _thumbnail_recheck_scheduled:
        # invalidate_extension_info() below causes another update_file_info
        # call for this same (folder, name), which must NOT schedule a
        # second recheck — otherwise this would reschedule itself forever.
        file.invalidate_extension_info()
        return GLib.SOURCE_REMOVE
