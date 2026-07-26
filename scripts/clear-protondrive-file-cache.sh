#!/usr/bin/env bash
# Clears the locally cached decrypted copy of the selected file(s), without
# touching anything on Drive — the mount re-downloads and re-decrypts on
# next open. Talks to the running mount daemon's IPC socket via the `evict`
# CLI command (see src/ipcServer.ts), so it only does anything while the
# mount is active and only for paths actually under it. Bound to a Nemo
# right-click action by install-nemo-clear-file-cache-action.sh.
set -uo pipefail

MOUNT_POINT="${PROTONDRIVE_NEMO_MOUNT_POINT:-$HOME/ProtonDrive}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <path> [path...]" >&2
    exit 1
fi

OUTPUT="$(node "$REPO_DIR/dist/cli.js" evict --mount-point "$MOUNT_POINT" "$@" 2>&1)"
STATUS=$?

if command -v notify-send >/dev/null 2>&1; then
    notify-send "Proton Drive" "$OUTPUT"
else
    echo "$OUTPUT"
fi

exit "$STATUS"
