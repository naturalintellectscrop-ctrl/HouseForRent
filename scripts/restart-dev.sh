#!/usr/bin/env bash
# Restart the PGlite rig + Next.js dev server (verified working 2025-10-31).
# Run from a persistent shell session. All output goes to /tmp/rig5522.log and ./dev.log.
set -u
cd "$(dirname "$0")/.."

# 1. Clean up
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "dev-local-stack" 2>/dev/null
sleep 1
rm -f .next/dev/lock
echo "cleaned"

# 2. Start PGlite rig on 127.0.0.1:5522
nohup setsid env DATA_DIR=/tmp/hfr-approvals-rig PORT_DB=5522 \
  bun scripts/dev-local-stack.mjs > /tmp/rig5522.log 2>&1 < /dev/null &
disown
for i in $(seq 1 15); do
  grep -q "listening on 127.0.0.1:5522" /tmp/rig5522.log && break
  sleep 1
done
if ! grep -q "listening on 127.0.0.1:5522" /tmp/rig5522.log; then
  echo "RIG FAILED — /tmp/rig5522.log:"; cat /tmp/rig5522.log; exit 1
fi
echo "rig: listening on 127.0.0.1:5522"

# 3. Start Next.js dev server against the rig
# NOTE: DATABASE_URL must stay quoted — unquoted & truncates the assignment.
nohup setsid env 'DATABASE_URL=postgresql://dev:dev@127.0.0.1:5522/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60' \
  MEDIA_STORAGE=local bun run dev > dev.log 2>&1 < /dev/null &
disown

# 4. Wait for readiness
code=000
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/api/v1/listings)
  [ "$code" != "000" ] && break
  sleep 2
done
echo "dev server: HTTP $code on /api/v1/listings"
[ "$code" = "000" ] && { echo "DEV SERVER FAILED — dev.log:"; tail -20 dev.log; exit 1; }
echo "done. tail dev.log with: tail -f dev.log"
