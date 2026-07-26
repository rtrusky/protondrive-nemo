#!/usr/bin/env bash
# Adds a "Clear cached copy" entry to Nemo's right-click menu for files
# (multi-selection supported). Idempotent: safe to run more than once. The
# action shows for any file but only does anything for files actually under
# the ProtonDrive mount while it's running — see clear-protondrive-file-cache.sh.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIONS_DIR="$HOME/.local/share/nemo/actions"
ACTION_FILE="$ACTIONS_DIR/protondrive-nemo-clear-file-cache.nemo_action"

mkdir -p "$ACTIONS_DIR"

cat > "$ACTION_FILE" <<EOF
[Nemo Action]
Name=Clear cached copy
Comment=Remove the locally cached decrypted copy; the file stays on Drive
Exec=$REPO_DIR/scripts/clear-protondrive-file-cache.sh %F
Icon-Name=edit-clear
Selection=Any
Extensions=nodirs;
EOF

echo "Installed $ACTION_FILE"
echo "Restart Nemo (nemo -q) for the new right-click action to show up."
echo "It shows for any file but only acts on files under the ProtonDrive mount while it's running."
