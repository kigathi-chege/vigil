#!/usr/bin/env bash
# Runs the extension in a throwaway headless GNOME Shell and screenshots the desktop card and menu.
#   gnome/tests/headless.sh [out-dir]     -> result.json, desktop.png, menu.png
# Everything is isolated: own D-Bus session, keyfile settings, data and cache dirs. Your real
# session and dconf are never touched (the guard below refuses to run otherwise).
set -Eeuo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
UUID=widget-framework@kigathi-chege.github.io

if [[ "${WF_ISOLATED:-}" != 1 ]]; then
  OUT="$(readlink -f "${1:-$(mktemp -d)}")"; mkdir -p "$OUT"
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  mkdir -p "$T"/{config,data,cache,state}
  # Set before dbus-run-session, so dconf and every activated service inherit the isolation too.
  env WF_ISOLATED=1 WF_TEST_OUT="$OUT" GSETTINGS_BACKEND=keyfile \
    XDG_CONFIG_HOME="$T/config" XDG_DATA_HOME="$T/data" XDG_CACHE_HOME="$T/cache" XDG_STATE_HOME="$T/state" \
    timeout 120 dbus-run-session -- "$0" >/dev/null 2>&1 || true
  cat "$OUT/result.json" 2>/dev/null || { echo "no result; see $OUT/shell.log"; exit 1; }
  echo; echo "screenshots: $OUT/desktop.png $OUT/menu.png"
  exit 0
fi

[[ "$GSETTINGS_BACKEND" == keyfile && "$XDG_CONFIG_HOME" != "$HOME/.config" ]] || { echo "not isolated" >&2; exit 1; }
EXT="$XDG_DATA_HOME/gnome-shell/extensions"
mkdir -p "$EXT"
cp -r "$HERE/../$UUID" "$HERE/testhook@local" "$EXT/"
glib-compile-schemas "$EXT/$UUID/schemas"
gsettings set org.gnome.shell enabled-extensions "['$UUID', 'testhook@local']"
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x1000 > "$WF_TEST_OUT/shell.log" 2>&1 &
pid=$!
for _ in $(seq 1 60); do
  [[ -f "$WF_TEST_OUT/result.json" ]] && break
  grep -q 'TESTHOOK FAIL' "$WF_TEST_OUT/shell.log" && break
  sleep 0.5
done
kill "$pid"; wait "$pid" 2>/dev/null || true
