# Task 8 — planner watchdog

Planner p95 = 13,063s = 3.6 hours. Hidden bottleneck.

3 files. ~50 lines. ONE commit on src/planner.ts. Watchdog script is local (NOT committed).

## Step 1: Read src/planner.ts (139 lines)
Find the planner's LLM call. Does it use shared callLLM (which has 90s timeout) or its own path?

## Step 2: Fix in 3 things

### A. src/planner.ts — enforce 60s planner timeout
Wrap the planner's LLM call with Promise.race:
```ts
const PLAN_TIMEOUT_MS = Number(process.env.PLAN_TIMEOUT_MS || 60000);
const out = await Promise.race([
  callLLM(...),
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`planner timeout after ${PLAN_TIMEOUT_MS}ms`)), PLAN_TIMEOUT_MS))
]);
```

### B. /root/zoro-planner-watchdog.sh (new, NOT in git)
```bash
#!/usr/bin/env bash
set -euo pipefail
DBURL=$(grep "^DATABASE_URL=" /root/agency-pipeline/.env | sed 's/DATABASE_URL=//')
THRESHOLD_S=300
psql "$DBURL" -t -A -F'|' -c "
  update tasks t set status='failed', updated_at=now(), attempts = attempts + 1
  from projects p
  where t.project_id = p.id
    and t.department in ('plan', 'planning', 'planner')
    and t.status = 'running'
    and extract(epoch from (now() - t.updated_at)) > $THRESHOLD_S
  returning t.id, t.project_id;
" | while IFS='|' read -r tid pid; do
  [ -z "$tid" ] && continue
  echo "[$(date -u +%H:%M:%S)] watchdog killed stuck planner task $tid in $pid"
  psql "$DBURL" -c "insert into run_events(project_id, task_id, type, detail) values ('$pid','$tid','watchdog_killed','planner >${THRESHOLD_S}s')" >/dev/null 2>&1
done
```
chmod +x /root/zoro-planner-watchdog.sh

### C. crontab entry
( crontab -l 2>/dev/null; echo "*/5 * * * * /root/zoro-planner-watchdog.sh >> /var/log/zoro-planner-watchdog.log 2>&1" ) | crontab -

## Acceptance
- [ ] src/planner.ts has 60s Promise.race timeout
- [ ] /root/zoro-planner-watchdog.sh exists + executable
- [ ] crontab has */5 entry for watchdog
- [ ] tsc --noEmit clean
- [ ] ONE commit on src/planner.ts: "R4: planner watchdog — 60s timeout + cron"
- [ ] Co-authored-by: Claude Opus 4.8

## Out of scope
- Do NOT touch agents.ts (check if planner uses shared callLLM first; if so, only add the timeout wrapper in planner.ts, don't modify callLLM)
- Do NOT add dependencies
- Do NOT change other cron entries

## When done: 5-line summary
1. commit hash + subject
2. tsc result
3. crontab verification
4. watchdog test (run the script, no error)
5. root-cause: was planner using callLLM (with timeout) or a separate path?
