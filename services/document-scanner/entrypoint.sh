#!/bin/sh
set -eu
clamd --foreground=false
i=0
while [ ! -S /run/clamav/clamd.ctl ]; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || exit 1
  sleep 1
done
exec node /app/server.mjs
