#!/usr/bin/env bash
# Launch Song Catcher from the production build and open it in the browser.
#
#   song-catcher.sh [start]   start the server if it is not running, then open the UI
#   song-catcher.sh stop      stop the server started by this script
#   song-catcher.sh status    print whether the server is running
#
# Set SONG_CATCHER_NODE to use a specific node binary (the desktop entry does this,
# because desktop sessions often lack the PATH your shell has).
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/song-catcher"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"
NODE="${SONG_CATCHER_NODE:-$(command -v node || true)}"
STARTUP_TIMEOUT=30

notify() {
  echo "song-catcher: $*" >&2
  if command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name="Song Catcher" --icon=song-catcher "Song Catcher" "$*" || true
  fi
}

# Read KEY from the environment first, then from .env, then fall back to a default.
env_value() {
  local key="$1" default="$2" value="${!1:-}"
  if [[ -z "$value" && -f "$ROOT/.env" ]]; then
    value="$(grep -E "^[[:space:]]*${key}=" "$ROOT/.env" | tail -n1 | cut -d= -f2- || true)"
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
  fi
  echo "${value:-$default}"
}

HOST="$(env_value DEEZER_HTTP_HOST 127.0.0.1)"
PORT="$(env_value DEEZER_HTTP_PORT 5000)"
PREFIX="$(env_value DEEZER_URL_PREFIX '')"
PREFIX="${PREFIX#/}"; PREFIX="${PREFIX%/}"
[[ -n "$PREFIX" ]] && PREFIX="/$PREFIX"
case "$HOST" in
  0.0.0.0 | "") HOST=127.0.0.1 ;;
  :: | "[::]") HOST=localhost ;;
esac
URL="http://$HOST:$PORT$PREFIX/"

healthy() {
  curl -fs -o /dev/null --max-time 2 "${URL}api/health"
}

our_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null && echo "$pid"
}

start() {
  if healthy; then
    xdg-open "$URL" >/dev/null 2>&1 &
    return
  fi

  if [[ -z "$NODE" || ! -x "$NODE" ]]; then
    notify "node not found. Set SONG_CATCHER_NODE or re-run scripts/install-desktop-entry.sh."
    exit 1
  fi
  if [[ ! -f "$ROOT/server/dist/cli.js" || ! -f "$ROOT/web/dist/index.html" ]]; then
    notify "No build found. Run 'npm run build' in $ROOT first."
    exit 1
  fi

  mkdir -p "$STATE_DIR"
  cd "$ROOT"
  setsid nohup "$NODE" --env-file-if-exists=.env server/dist/cli.js >"$LOG_FILE" 2>&1 </dev/null &
  local pid=$!
  echo "$pid" >"$PID_FILE"

  for ((i = 0; i < STARTUP_TIMEOUT * 2; i++)); do
    if healthy; then
      xdg-open "$URL" >/dev/null 2>&1 &
      return
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      notify "Server failed to start: $(tail -n 3 "$LOG_FILE" | tr '\n' ' ')"
      exit 1
    fi
    sleep 0.5
  done
  notify "Server did not become healthy within ${STARTUP_TIMEOUT}s. See $LOG_FILE."
  exit 1
}

stop() {
  local pid
  if pid="$(our_pid)"; then
    kill "$pid"
    for ((i = 0; i < 20; i++)); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    rm -f "$PID_FILE"
    notify "Server stopped."
  elif healthy; then
    notify "A server is running at $URL but was not started by this launcher; leaving it alone."
  else
    notify "Server is not running."
  fi
}

status() {
  if healthy; then
    echo "running at $URL (pid $(our_pid || echo 'unknown, not started by this launcher'))"
  else
    echo "not running"
    return 1
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "usage: $0 [start|stop|status]" >&2
    exit 2
    ;;
esac
