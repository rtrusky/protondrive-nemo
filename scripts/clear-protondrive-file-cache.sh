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

# Nemo launches actions with the file manager's own (non-login,
# nvm-unaware) environment, not an interactive shell's — same reason
# systemd/protondrive-nemo.service sources nvm.sh directly rather than
# relying on `node` already being on PATH. Source it unconditionally
# (not only when node is missing): a stray system `node` earlier on
# PATH — e.g. an older apt-installed one — would otherwise shadow the
# version this app needs, and this app requires Node 20+. nvm.sh
# prepends its own bin dir, so it takes priority once sourced.
NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    export NVM_DIR
    # shellcheck disable=SC1091
    \. "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
    OUTPUT="node not found (checked PATH and \$NVM_DIR/nvm.sh)"
    STATUS=1
else
    OUTPUT="$(node "$REPO_DIR/dist/cli.js" evict --mount-point "$MOUNT_POINT" "$@" 2>&1)"
    STATUS=$?
fi

if command -v notify-send >/dev/null 2>&1; then
    notify-send "Proton Drive" "$OUTPUT"
else
    echo "$OUTPUT"
fi

exit "$STATUS"
