#!/usr/bin/env bash
# One-shot financial-UI browser verification: boots the dev server, drives
# the real UI through login + the finance surfaces, captures screenshots.
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

export AGENT_BROWSER_SESSION=finance-ui-verify
AB="agent-browser"

$AB open http://127.0.0.1:3000/platform/login > /dev/null 2>&1
sleep 2
ref_of() { echo "$1" | grep "ref=e" | grep -F "$2" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'; }
SNAP=$($AB snapshot -i 2>/dev/null)
PHONE_REF=$(ref_of "$SNAP" 'Operator email or phone')
PASS_REF=$(ref_of "$SNAP" 'textbox "Password"')
SUBMIT_REF=$(ref_of "$SNAP" 'Enter control center')
echo "refs: $PHONE_REF $PASS_REF $SUBMIT_REF"
$AB fill "$PHONE_REF" "+2567700001619"
$AB fill "$PASS_REF" "qa-85eyayvw-rig"
$AB click "$SUBMIT_REF"
sleep 5
echo "after-login URL: $($AB get url)"
$AB screenshot /tmp/fin-ui-platform.png

$AB open http://127.0.0.1:3000/platform/transactions > /dev/null 2>&1
sleep 3
$AB screenshot /tmp/fin-ui-transactions.png
$AB read > /tmp/fin-ui-transactions.txt 2>&1

# ops console deal detail (settled deal with deposit case + post-settlement actions)
DEAL=2292b922-fb51-4a07-ae20-3c1f6595b03f
$AB open "http://127.0.0.1:3000/ops/deals/$DEAL" > /dev/null 2>&1
sleep 3
$AB screenshot /tmp/fin-ui-ops-deal.png
$AB read > /tmp/fin-ui-ops-deal.txt 2>&1

# portal: tenant sign-in → deal detail
$AB open "http://127.0.0.1:3000/login" > /dev/null 2>&1
sleep 2
$AB read > /tmp/fin-ui-login.txt 2>&1
SNAP=$($AB snapshot -i 2>/dev/null)
echo "portal login snapshot:"
echo "$SNAP" | head -12

echo DONE
