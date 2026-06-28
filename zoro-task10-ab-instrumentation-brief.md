# Task 10 — A/B instrumentation: per-call provider + latency into run_events

Nao has been doubting the openrouter direction. To settle it with data, we need per-call instrumentation: which provider each LLM call used, what model, how long it took, and whether it succeeded. This task wires that into the existing run_events table so SQL queries can answer the A/B question.

3 files. ONE commit. Pure instrumentation — no behavior change.

## Step 1: Read
- `src/agents.ts` (find `callLLM` and `llm` functions; both branches — openrouter and direct)
- `src/runner.ts` (find where it calls into agents.ts; the runAgent or similar function)
- `src/kpi.ts` (add a new KPI for provider split + latency)

## Step 2: Modify

### File 1: `src/agents.ts`

Modify `callLLM(system, user, maxTokens, opts?)` so it returns `{ text: string; meta: { provider: 'openrouter'|'minimax-direct'; model: string; latencyMs: number; web: boolean; ok: boolean; error?: string } }` INSTEAD of returning just the text.

For backward compat: the existing `llm(...)` function (used by planner.ts and others) — wrap it so callers that use the string form still work. Pattern:

```ts
export type LLMResult = { text: string; meta: { provider: 'openrouter'|'minimax-direct'; model: string; latencyMs: number; web: boolean; ok: boolean; error?: string } };

export async function callLLM(system: string, user: string, maxTokens: number, opts: { web?: boolean } = {}): Promise<LLMResult> {
  const t0 = Date.now();
  const web = !!opts.web;
  try {
    if (OR_KEY) {
      // ... existing openrouter path ...
      const text = ...; // existing code extracts this
      return { text, meta: { provider: 'openrouter', model: OR_MODEL, latencyMs: Date.now()-t0, web, ok: true } };
    }
    // ... direct fallback ...
    return { text, meta: { provider: 'minimax-direct', model: MODEL, latencyMs: Date.now()-t0, web, ok: true } };
  } catch (e: any) {
    return { text: '', meta: { provider: OR_KEY ? 'openrouter' : 'minimax-direct', model: OR_KEY ? OR_MODEL : MODEL, latencyMs: Date.now()-t0, web, ok: false, error: String(e?.message ?? e) } };
  }
}
```

Also export a string-returning wrapper for callers that don't want the meta:
```ts
export async function llmText(system: string, user: string, maxTokens: number, opts: { web?: boolean } = {}): Promise<string> {
  return (await callLLM(system, user, maxTokens, opts)).text;
}
```

Keep the existing `llm(...)` function as a thin wrapper around `llmText` so callers like `planner.ts` (which uses `llm(..., { web: true })`) don't break. Add `llmTracked(...)` that returns the full `LLMResult`.

### File 2: `src/runner.ts`

In the function that runs an agent (where it currently calls the LLM via the agents.ts entry point), after each call, write the meta to run_events:

```ts
// after the agent call:
const result = await callLLM(...);
await pool.query(
  "insert into run_events(project_id, task_id, type, detail) values ($1, $2, 'llm_call', $3)",
  [task.project_id, task.id, JSON.stringify(result.meta)]
);
```

This needs `pool` in scope — find the runner function that has both the task + the pool. If only one LLM call site needs this, change just that one. If multiple, do all of them.

### File 3: `src/kpi.ts`

Add 2 new KPIs to the returned `kpis` array:

```ts
// provider split (last 50 calls)
const providers = (await pool.query(
  "select detail->>'provider' as p, count(*) n, round(avg((detail->>'latencyMs')::int))::int avg_ms from run_events where type='llm_call' and created_at > now() - interval '7 days' group by 1 order by n desc"
)).rows;
const total = providers.reduce((s,p) => s + Number(p.n), 0) || 1;
{
  group: 'signal',
  key: 'llm_provider',
  label: 'LLM provider split (7d)',
  value: providers.map(p => `${p.p} ${Math.round(100*Number(p.n)/total)}%`).join(' · ') || '—',
  sub: providers.map(p => `${p.p}: ${p.n} calls, avg ${p.avg_ms}ms`).join(' · ') || 'no data yet',
  tone: 'neutral',
},
{
  group: 'efficiency',
  key: 'llm_latency',
  label: 'LLM latency (avg, 7d)',
  value: providers.length ? `${providers.reduce((s,p) => s + Number(p.avg_ms), 0) / providers.length | 0}ms` : '—',
  sub: providers.map(p => `${p.p} ${p.avg_ms}ms`).join(' · ') || 'no data yet',
  tone: 'neutral',
}
```

The actual JSON parsing of `detail` field depends on the type column being JSON or text. Inspect `run_events.detail` type — if text, parse with `::jsonb`. If jsonb, no cast needed.

## Step 3: Verify

After committing, run a small test:
- The current code uses `llm(...)` returning string → keep that working (planner.ts, agents.ts internal)
- The new code uses `callLLM(...)` returning LLMResult (used in runner.ts where instrumentation happens)
- All other callers continue working unchanged

## Acceptance

- [ ] `src/agents.ts` exports `LLMResult`, `callLLM`, `llmText`, `llmTracked`. Backward compat preserved.
- [ ] `src/runner.ts` writes `run_events.type='llm_call'` with meta JSON after each LLM call
- [ ] `src/kpi.ts` shows the two new KPIs
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test -- src/spec-test.ts` passes
- [ ] ONE commit: "R6: A/B instrumentation — per-call provider + latency into run_events"
- [ ] Co-authored-by: Claude Opus 4.8

## Out of scope

- Do NOT change the LLM provider choice logic (still openrouter-first, minimax-direct fallback)
- Do NOT change the planner.ts `web:false` (R5 stays)
- Do NOT touch other depts
- Do NOT change the eval harness
- Do NOT add new dependencies (use pg + JSON ops already in the codebase)

## When done

Print 5-line summary:
1. commit hash + subject
2. tsc + test results
3. files changed (count)
4. lines diff
5. any anomaly

Exit.
