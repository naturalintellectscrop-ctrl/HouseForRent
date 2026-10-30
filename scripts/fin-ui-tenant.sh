#!/usr/bin/env bash
set -u
cd /home/z/my-project
pkill -9 -f "next dev" 2>/dev/null
sleep 1
rm -f .next/dev/lock
setsid bash -c 'DATABASE_URL="postgresql://rig:rig@127.0.0.1:5511/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60" exec bun run dev' > /tmp/dev3000.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/api/v1/listings || true)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "server: $code"
export AGENT_BROWSER_SESSION=finance-ui-tenant
AB="agent-browser"
ref_of() { echo "$1" | grep "ref=e" | grep -F "$2" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'; }

$AB open http://127.0.0.1:3000/login > /dev/null 2>&1
sleep 2
SNAP=$($AB snapshot -i 2>/dev/null)
$AB fill "$(ref_of "$SNAP" 'Phone number or email')" "+256776893032"
$AB fill "$(ref_of "$SNAP" 'textbox "Password"')" "QaWalkPass!2026"
$AB click "$(ref_of "$SNAP" 'button "Sign in"')"
sleep 4
echo "tenant URL: $($AB get url)"
$AB read > /tmp/fin-ui-tenant-login-debug.txt 2>&1
DEAL=2292b922-fb51-4a07-ae20-3c1f6595b03f
$AB open "http://127.0.0.1:3000/account/deals/$DEAL" > /dev/null 2>&1
sleep 3
$AB screenshot /tmp/fin-ui-tenant-deal.png
$AB read > /tmp/fin-ui-tenant-deal.txt 2>&1
# mobile viewport
$AB set viewport 390 844 > /dev/null 2>&1 || $AB viewport 390 844 > /dev/null 2>&1 || true
sleep 1
$AB screenshot /tmp/fin-ui-tenant-deal-mobile.png
$AB close > /dev/null 2>&1
echo DONE
