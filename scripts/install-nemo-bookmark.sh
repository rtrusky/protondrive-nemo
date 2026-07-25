#!/usr/bin/env bash
# Adds a "Proton Drive" shortcut to Nemo's (and Nautilus'/Thunar's) sidebar
# by appending to the GTK bookmarks file they all read. Idempotent: safe to
# run more than once.
set -euo pipefail

MOUNT_POINT="${1:-$HOME/ProtonDrive}"
BOOKMARKS_FILE="$HOME/.config/gtk-3.0/bookmarks"
BOOKMARK_LINE="file://$MOUNT_POINT Proton Drive"

mkdir -p "$(dirname "$BOOKMARKS_FILE")"
touch "$BOOKMARKS_FILE"

if grep -qxF "$BOOKMARK_LINE" "$BOOKMARKS_FILE"; then
    echo "Bookmark already present in $BOOKMARKS_FILE"
    exit 0
fi

echo "$BOOKMARK_LINE" >> "$BOOKMARKS_FILE"
echo "Added Proton Drive bookmark ($MOUNT_POINT) to $BOOKMARKS_FILE"
echo "Restart Nemo (nemo -q) or log out/in for the sidebar to pick it up."
