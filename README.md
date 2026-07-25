# protondrive-nemo

An unofficial FUSE mount of [Proton Drive](https://proton.me/drive) for
Linux Mint's Nemo file manager (and any other file manager, since it's a
real mountpoint — Nautilus, Thunar, Dolphin, etc. all work too).

> **This is a third-party application, not officially supported by Proton.**
> It is not affiliated with, endorsed by, or connected to Proton AG. It is
> built on Proton's official, MIT-licensed [Drive SDK](https://github.com/ProtonDriveApps/sdk),
> under that SDK's guidelines for personal, non-commercial use.

## What it does

Mounts your Proton Drive "My Files" at `~/ProtonDrive` as a normal folder:
browse, open, edit and save, create folders, rename, move, and delete —
Nemo (or any file manager, or any application) sees it like any other
directory. There's no separate sync engine or Nemo extension involved: it's
a real FUSE filesystem, so file-manager integration comes for free.

## How it works

- **Auth & Drive API access**: via Proton's official SDK
  (`@protontech/drive-sdk` + a vendored copy of its `incubating/account`
  module — see [VENDOR.md](VENDOR.md) for why that's vendored rather than
  installed from npm). Sign-in is the same browser-based flow Proton's own
  apps use — no password is ever typed into this tool.
- **Filesystem**: [`@cocalc/fuse-native`](https://github.com/sagemathinc/fuse-native)
  (an actively maintained N-API FUSE binding). See
  [Architecture](#architecture) below for how FUSE calls map to Drive API
  calls.
- **Session storage**: your login session is stored in the OS keychain via
  `keytar` (libsecret/GNOME Keyring on Linux), under its own service name
  — separate from Proton's official `proton-drive` CLI, so both can be
  installed without conflicting.

## Requirements

- Linux with `libfuse` (either `libfuse2`/`fuse` or `libfuse3`/`fuse3` — most
  distros, including Linux Mint, have one of these by default) and
  `libfuse-dev` to build the native binding.
- Node.js 20+.
- A Secret Service provider for session storage (GNOME Keyring, which Linux
  Mint ships by default, or KWallet with the appropriate libsecret backend).

## Build

```bash
npm install
npm run build
```

This produces `dist/cli.js`. `npm install` needs `libfuse-dev` present to
compile the native FUSE binding:

```bash
sudo apt install libfuse-dev   # Debian/Ubuntu/Linux Mint
```

## Usage

```bash
node dist/cli.js login     # opens your browser to sign in to Proton
node dist/cli.js mount     # mounts ~/ProtonDrive, runs in the foreground
```

In another terminal (or Ctrl+C the `mount` process to unmount):

```bash
node dist/cli.js unmount
```

Other commands: `node dist/cli.js status`, `node dist/cli.js logout`.

Add `-m /custom/path` to `mount`/`unmount` to use a different mount point
than the default `~/ProtonDrive`.

### Run automatically on login

```bash
mkdir -p ~/.config/systemd/user
ln -s "$(pwd)/systemd/protondrive-nemo.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now protondrive-nemo
```

### Add a Nemo sidebar shortcut

```bash
./scripts/install-nemo-bookmark.sh        # bookmarks ~/ProtonDrive
nemo -q                                    # restart Nemo to pick it up
```

## Architecture

```
src/cli.ts              commander CLI: login, logout, status, mount, unmount
src/mount.ts             wires DriveTree + ContentStore + FUSE ops into a Fuse instance
src/fuseOps.ts            FUSE syscall handlers (getattr, readdir, read, write, ...)
src/driveTree.ts          FUSE path <-> Drive node UID resolution + short-lived directory-listing cache
src/contentStore.ts        local blob cache: download-on-open, upload-on-release
src/sdk-bootstrap/         bootstraps @protontech/drive-sdk's ProtonDriveClient:
                            auth (via vendored proton-drive-sdk-account), HTTP client,
                            encrypted SQLite entities/crypto cache, event-cursor persistence
                            — ported from ProtonDriveApps/sdk's own CLI, see VENDOR.md
vendor/proton-drive-sdk-account/  vendored (unpublished) Proton auth/session module
src/types/stubs/           tsc-only type stand-ins for @protontech/crypto — see the
                            comment at the top of protontech-crypto.ts for why
```

Content model: opening a file downloads it in full to a local cache
(`$XDG_CACHE_HOME/protondrive-nemo/blobs/`, decrypted) before any byte is
readable, and a dirty file is re-uploaded as a new revision on close. This
is simple and reliable but means very large files are slower to open than a
true byte-range/streaming implementation would be — a reasonable v1
tradeoff given Proton's own SDK doesn't yet ship a sync module to build a
smarter cache on top of (see [VENDOR.md](VENDOR.md)).

Directory listings are cached in memory per folder for 10 seconds to avoid
re-iterating a folder's children on every single FUSE `getattr`/`readdir`
call (Nemo issues a lot of these per visible file); mutations you make
locally (create/rename/move/delete) invalidate the affected folder's cache
immediately, so your own changes always show up right away.

## Limitations (v1)

- Only "My Files" is exposed — no Trash, Devices, Shared-with-me, or Photos.
- No true streaming: large file opens download the whole file first.
- No conflict handling beyond what the SDK itself does — this isn't a
  background sync engine, just a live view.
- No Nemo-specific extras yet (sync-status emblems, "copy share link" in the
  right-click menu). Since this is a real mount, basic file operations don't
  need them; they're a natural follow-up built on the SDK's sharing API.

## License

MIT — see [LICENSE](LICENSE). Vendors and adapts MIT-licensed code from
[ProtonDriveApps/sdk](https://github.com/ProtonDriveApps/sdk); see
[VENDOR.md](VENDOR.md) for provenance and what was changed.
