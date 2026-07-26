#!/usr/bin/env bash
# Installs the "is this file/folder cached locally?" emblem overlay for
# Nemo: a Python extension (nemo-python) plus its emblem icons. Idempotent.
# Requires the python-nemo / nemo-python package (provides the `Nemo` GI
# typelib) — this is preinstalled on Linux Mint alongside Nemo itself.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$HOME/.local/share/nemo-python/extensions"
ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/emblems"

if ! python3 -c "import gi; gi.require_version('Nemo', '3.0'); from gi.repository import Nemo" >/dev/null 2>&1; then
    echo "Warning: python3 can't import the Nemo GI typelib (python-nemo/nemo-python package)." >&2
    echo "The emblem extension will be installed but Nemo won't be able to load it until that's present." >&2
fi

mkdir -p "$EXT_DIR" "$ICON_DIR"
cp "$REPO_DIR/nemo-extension/protondrive_cache_status.py" "$EXT_DIR/"
cp "$REPO_DIR/nemo-extension/icons/"*.svg "$ICON_DIR/"

echo "Installed emblem extension to $EXT_DIR"
echo "Installed emblem icons to $ICON_DIR"
echo "Restart Nemo (nemo -q) for it to take effect."
echo "Files/folders under ~/ProtonDrive get a checkmark (cached), cloud"
echo "(not cached), or dash (folder: partially cached) badge; it only"
echo "shows anything while the mount daemon is running."
