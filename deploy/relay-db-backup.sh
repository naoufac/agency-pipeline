#!/usr/bin/env bash
# Daily pg_dump of Relay's agency DB (ap-pg). Restorable (--clean --if-exists). 14 kept.
set -euo pipefail
DIR=/root/backups/relay-db
mkdir -p "$DIR"
TS=$(date -u +%Y%m%d-%H%M%S)
OUT="$DIR/agency-$TS.sql.gz"
docker exec ap-pg pg_dump -U postgres -d agency --no-owner --clean --if-exists | gzip > "$OUT"
ls -1t "$DIR"/agency-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "$(date -u +%FT%TZ) ok $(du -h "$OUT" | cut -f1) -> $OUT" >> "$DIR/backup.log"
