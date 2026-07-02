# Task 12 — R8: fix the eval to actually run in LIVE mode

The `npm run eval` command is theater. It claims 100% pass but runs in STUB mode (template fallback, no LLM calls) because:
- `src/agents.ts` reads `process.env.OPENROUTER_API_KEY` directly
- `src/eval.ts` does the same stub detection (`!process.env.OPENROUTER_API_KEY && !process.env.MINIMAX_API_KEY`)
- Neither loads `.env`
- Production works because systemd `relay.service` has `EnvironmentFile=.env`
- But `npm run eval` (dev/CI invocation) sees empty env → STUB → meaningless results

This means R1–R7 might LOOK good but the eval never proved them. Fix it so `npm run eval` actually exercises the LLM path with real MiniMax/OpenRouter calls.

Tight scope. 2-3 files. ONE commit.

## Step 1: Investigate

- Confirm the bug: run `npm run eval` and see it say "STUB mode"
- Check if `.env` exists and has keys: `grep -E '^(OPENROUTER|MINIMAX)_' /root/agency-pipeline/.env | sed 's/=.*/=***/'`
- Check `src/eval.ts` line ~111 for the stub detection
- Check `src/agents.ts` lines 14-20 for env reads
- Read `src/run.ts` and `src/server.ts` for how they initialize (maybe they already load .env — replicate that pattern)

## Step 2: Fix

### File 1: `package.json` (preferred — no code change, just shell-level fix)

Change the eval scripts to source .env before running:

```json
"eval": "set -a; . ./.env 2>/dev/null; set +a; tsx src/eval.ts",
"stress": "set -a; . ./.env 2>/dev/null; set +a; tsx _stress.ts",
"theme:check": "set -a; . ./.env 2>/dev/null; set +a; tsx src/theme-check.ts",
"spec:check": "set -a; . ./.env 2>/dev/null; set +a; tsx src/spec-test.ts",
"demo": "set -a; . ./.env 2>/dev/null; set +a; tsx src/demo.ts",
"run": "set -a; . ./.env 2>/dev/null; set +a; tsx src/run.ts",
"serve": "set -a; . ./.env 2>/dev/null; set +a; tsx src/server.ts",
"worker": "set -a; . ./.env 2>/dev/null; set +a; tsx src/worker.ts",
"kpi": "set -a; . ./.env 2>/dev/null; set +a; tsx src/kpi-cli.ts",
"dogfood": "set -a; . ./.env 2>/dev/null; set +a; tsx src/dogfood-cli.ts",
"mail:test": "set -a; . ./.env 2>/dev/null; set +a; tsx src/mail-cli.ts"
```

`set -a` exports all variables automatically; `set +a` reverts. `. ./.env` is silent if missing.

### File 2: `src/eval.ts` (optional defense-in-depth, only if file 1 alone isn't enough)

If after the package.json fix the eval STILL shows STUB mode, add an inline .env loader at the top of eval.ts:

```ts
import { readFileSync, existsSync } from 'node:fs';
if (!process.env.OPENROUTER_API_KEY && !process.env.MINIMAX_API_KEY) {
  for (const p of ['.env', '../.env']) {
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
}
```

But ONLY do this if file 1 alone isn't enough. Prefer the package.json fix because it's a 1-line shell pattern, not embedded logic.

## Step 3: Verify

After committing:
1. `npm run eval` should now say `LIVE (external key)` not `STUB mode ($0, not representative)`
2. It should actually call MiniMax/OpenRouter — expect 30-90s runtime (vs <5s for stub)
3. Real pass rate might be DIFFERENT from 100% — that's OK, we want truth not theater
4. Report the actual pass rate + any failures

## Acceptance

- [ ] package.json scripts source .env before tsx
- [ ] `npm run eval` reports LIVE mode
- [ ] eval actually calls the LLM (runtime > 30s)
- [ ] spec:check still passes 83/0
- [ ] tsc --noEmit clean
- [ ] ONE commit: "R8: eval — fix .env loading, kill the STUB-mode theater"
- [ ] Co-authored-by: Claude Opus 4.8

## Out of scope

- Do NOT change the eval's stub-detection logic itself (the logic is correct, just unused because env isn't loaded)
- Do NOT add new dependencies
- Do NOT touch other scripts beyond the npm ones listed
- Do NOT change the eval harness semantics (15-brief corpus, scoring, report format)

## When done

Print 5-line summary:
1. commit hash + subject
2. `npm run eval` output (first 5 lines showing LIVE mode)
3. actual runtime (seconds)
4. files changed (count)
5. real pass rate (if eval ran end-to-end) or any anomaly

Exit.
