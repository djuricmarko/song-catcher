#!/usr/bin/env bash
# Install (or remove with --uninstall) a Song Catcher desktop entry for the current user.
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP_FILE="$DATA_HOME/applications/song-catcher.desktop"
ICON_FILE="$DATA_HOME/icons/hicolor/512x512/apps/song-catcher.png"
LAUNCHER="$ROOT/scripts/song-catcher.sh"

refresh() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$DATA_HOME/icons/hicolor" || true
}

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$DESKTOP_FILE" "$ICON_FILE"
  refresh
  echo "Removed $DESKTOP_FILE"
  exit 0
fi

NODE="${SONG_CATCHER_NODE:-$(command -v node || true)}"
if [[ -z "$NODE" ]]; then
  echo "node not found on PATH. Set SONG_CATCHER_NODE=/path/to/node and re-run." >&2
  exit 1
fi
NODE="$(readlink -f "$NODE")"

chmod +x "$LAUNCHER"
mkdir -p "$(dirname "$DESKTOP_FILE")" "$(dirname "$ICON_FILE")"
cp "$ROOT/web/public/icon-512.png" "$ICON_FILE"

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Song Catcher
GenericName=Music Downloader
Comment=Download music from Deezer and YouTube
Exec=env SONG_CATCHER_NODE="$NODE" "$LAUNCHER" start
Icon=song-catcher
Terminal=false
Categories=AudioVideo;Audio;
Keywords=music;deezer;youtube;download;
StartupNotify=false
Actions=stop;

[Desktop Action stop]
Name=Stop Server
Exec="$LAUNCHER" stop
EOF

refresh
echo "Installed $DESKTOP_FILE (node: $NODE)"
