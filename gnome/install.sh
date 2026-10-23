#!/usr/bin/env bash
# Install the GNOME Shell edition of the widget framework for the current user.
#   ./gnome/install.sh            install (copy) and enable
#   ./gnome/install.sh --link     symlink instead, so edits here apply after a re-login (for development)
#   ./gnome/install.sh --pack     build a zip for `gnome-extensions install` or extensions.gnome.org
#   ./gnome/install.sh --remove   disable and uninstall
set -Eeuo pipefail

UUID=widget-framework@kigathi-chege.github.io
SRC="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)/$UUID"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

# Adds the uuid to org.gnome.shell enabled-extensions directly. `gnome-extensions enable` only
# works once the running shell has loaded the extension, which on Wayland means after a re-login.
enable() {
  gnome-extensions enable "$UUID" 2>/dev/null && return
  local current
  current="$(gsettings get org.gnome.shell enabled-extensions)"
  [[ "$current" == *"'$UUID'"* ]] && return
  if [[ "$current" == "@as []" || "$current" == "[]" ]]; then
    gsettings set org.gnome.shell enabled-extensions "['$UUID']"
  else
    gsettings set org.gnome.shell enabled-extensions "${current%]}, '$UUID']"
  fi
}

case "${1:-}" in
  --remove)
    gnome-extensions disable "$UUID" 2>/dev/null || true
    rm -rf "$DEST"
    echo "Removed. Log out and back in to clear it from the top bar."
    ;;
  --pack)
    out="$(dirname "$SRC")/dist"
    mkdir -p "$out"
    gnome-extensions pack "$SRC" --force --out-dir "$out" \
      --extra-source=stats.js --extra-source=verse.js --extra-source=desktop.js --extra-source=verses.json
    echo "Built $out/$UUID.shell-extension.zip (install with: gnome-extensions install --force <zip>)"
    ;;
  --link | "")
    glib-compile-schemas --strict "$SRC/schemas"
    mkdir -p "$(dirname "$DEST")"
    rm -rf "$DEST"
    if [[ "${1:-}" == --link ]]; then ln -s "$SRC" "$DEST"; else cp -r "$SRC" "$DEST"; fi
    enable
    echo "Installed to $DEST and enabled."
    if [[ "${XDG_SESSION_TYPE:-}" == wayland ]] && ! gnome-extensions info "$UUID" &>/dev/null; then
      echo "GNOME on Wayland loads new extensions at login: log out and back in once to see it."
    fi
    ;;
  *)
    sed -n '2,6p' "$0"; exit 1
    ;;
esac
