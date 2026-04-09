#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PY="$BACKEND_DIR/venv_mac/bin/python"
NPM_CACHE_DIR="/tmp/keefoo-npm-cache"

if [ ! -x "$BACKEND_PY" ]; then
  echo "[ERROR] Backend virtualenv not found: $BACKEND_PY"
  echo "Please run: python3 -m venv backend/.venv && backend/.venv/bin/python -m pip install -r backend/requirements.txt"
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo "[ERROR] Frontend package.json not found: $FRONTEND_DIR/package.json"
  exit 1
fi

mkdir -p "$NPM_CACHE_DIR"

# Fix common npm optional-deps corruption (vite/tinyglobby/lightningcss missing files)
ensure_frontend_deps() {
  local vite_bin="$FRONTEND_DIR/node_modules/vite/bin/vite.js"
  local tinyglobby_bin="$FRONTEND_DIR/node_modules/tinyglobby/dist/index.mjs"
  local lightning_bin="$FRONTEND_DIR/node_modules/lightningcss/node/index.mjs"

  if [ -f "$vite_bin" ] && [ -f "$tinyglobby_bin" ] && [ -f "$lightning_bin" ]; then
    return 0
  fi

  echo "[INFO] Frontend deps incomplete, repairing..."
  rm -rf "$FRONTEND_DIR/node_modules" "$FRONTEND_DIR/package-lock.json"
  npm --prefix "$FRONTEND_DIR" install --include=dev --include=optional --prefer-online --cache "$NPM_CACHE_DIR"
}

ensure_frontend_deps

BACKEND_OLD_PID="$(lsof -ti tcp:8000 -sTCP:LISTEN || true)"
if [ -n "$BACKEND_OLD_PID" ]; then
  kill $BACKEND_OLD_PID >/dev/null 2>&1 || true
fi

FRONTEND_OLD_PID="$(lsof -ti tcp:5173 -sTCP:LISTEN || true)"
if [ -n "$FRONTEND_OLD_PID" ]; then
  kill $FRONTEND_OLD_PID >/dev/null 2>&1 || true
fi

(
  cd "$BACKEND_DIR"
  "$BACKEND_PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > /tmp/keefoo-backend.log 2>&1 &
  echo $! > /tmp/keefoo-backend.pid
)

(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 127.0.0.1 --port 5173 > /tmp/keefoo-frontend.log 2>&1 &
  echo $! > /tmp/keefoo-frontend.pid
)

sleep 2

echo "KeeFoo dev servers started."
echo "Frontend: http://127.0.0.1:5173"
echo "Backend:  http://127.0.0.1:8000"
echo "Backend log:  /tmp/keefoo-backend.log"
echo "Frontend log: /tmp/keefoo-frontend.log"
