#!/usr/bin/env bash
# Ping Relay; Telegram-alert on transition up<->down (flap-dampened via state file).
set -uo pipefail
[ -f /root/.relay-monitor.env ] && . /root/.relay-monitor.env
URL="https://board.naples.agency/healthz"
STATE=/tmp/relay-uptime.state
api="https://api.telegram.org/bot${TG_TOKEN}/sendMessage"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$URL" 2>/dev/null || echo 000)
prev=$(cat "$STATE" 2>/dev/null || echo up)
if [ "$code" = "200" ]; then
  [ "$prev" = "down" ] && curl -s -F chat_id="$TG_CHAT_ID" -F text="✅ Relay RECOVERED — board.naples.agency is back (200)." "$api" >/dev/null
  echo up > "$STATE"
else
  [ "$prev" = "up" ] && curl -s -F chat_id="$TG_CHAT_ID" -F text="🔴 Relay DOWN — board.naples.agency returned ${code}. systemd should auto-restart relay.service / the tunnel; check if it doesn't recover." "$api" >/dev/null
  echo down > "$STATE"
fi
