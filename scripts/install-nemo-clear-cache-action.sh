#!/usr/bin/env bash
# Adds a "Clear Proton Drive cache" entry to Nemo's right-click menu for
# folders. Idempotent: safe to run more than once. The action itself only
# acts when invoked on the ProtonDrive mount folder (see
# clear-protondrive-cache.sh) — on any other folder it's a no-op.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIONS_DIR="$HOME/.local/share/nemo/actions"
ACTION_FILE="$ACTIONS_DIR/protondrive-nemo-clear-cache.nemo_action"

mkdir -p "$ACTIONS_DIR"

cat > "$ACTION_FILE" <<EOF
[Nemo Action]
Name=Clear Proton Drive cache
Comment=Remove the locally cached decrypted copies; files stay in the cloud
Exec=$REPO_DIR/scripts/clear-protondrive-cache.sh %F
Icon-Name=edit-clear-all
Selection=S
Extensions=dir;
EOF

echo "Installed $ACTION_FILE"
echo "Restart Nemo (nemo -q) for the new right-click action to show up."
echo "It appears on any folder but only acts on the ProtonDrive mount folder itself."
