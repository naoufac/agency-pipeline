# Task 5+6 — dogfood capture + evolver stub + max_tokens fix

4 files in scope. ONE commit. ~50 lines total. Execute in order. Stay tight.

## Context
- R1 (build-spec contract + brand-lock) shipped as d202be5. spec:check 68/0 passes.
- The One Piece build hit "#13: OpenRouter: truncated before content — raise max_tokens (reasoning ate the budget)". This task fixes that.
- The evolver is the keystone for the level-3 self-improvement loop. This task CAPTURES findings (dogfood → spec_findings) but does NOT yet act on them.

## File 1: db/schema.sql (modify)
Read first. After the LAST existing CREATE TABLE block, append:

  -- spec_findings: dogfood captures for the (inactive) evolver. Pure capture, no automation yet.
  create table if not exists spec_findings (
    id bigserial primary key,
    project_id uuid not null references projects(id) on delete cascade,
    finding text not null,
    selector text,
    screenshot_path text,
    created_at timestamptz not null default now()
  );
  create index if not exists spec_findings_project_idx on spec_findings(project_id, created_at desc);

## File 2: src/dogfood.ts (modify)
Read first. Find the existing insert into dogfood_reviews (around line 130-131).
After it, for each HIGH-severity issue in the issues array, also insert into spec_findings:

  for (const issue of (issues ?? [])) {
    if (issue && (issue.severity === 'high' || issue.high === true)) {
      await pool.query(
        "insert into spec_findings(project_id, finding, selector, screenshot_path) values ($1, $2, $3, $4)",
        [projectId, String(issue.message ?? issue.description ?? JSON.stringify(issue)), issue.selector ?? null, screenshotPath ?? null]
      ).catch((e: any) => console.error('spec_findings insert', e?.message ?? e));
    }
  }

Adapt field names to match the actual issue shape in the file. Use .catch so a logging insert never breaks the dogfood verdict.

## File 3: src/evolver.ts (NEW file)

  // STUB: reads spec_findings, logs a count. Wired but inactive.
  // Future work: propose spec-schema changes, gate them locally, ship if metrics improve.
  import pg from 'pg';
  export async function evolverTick(pool: pg.Pool): Promise<void> {
    const r = await pool.query(
      "select count(*)::int n from spec_findings where created_at > now() - interval '7 days'"
    );
    console.log("[evolver] " + r.rows[0].n + " spec findings in last 7 days (inactive stub)");
  }

## File 4: src/agents.ts (modify — OpenRouter max_tokens fix)
Read first. Find the callLLM function (around line 92-115).

The bug: body.reasoning = { effort: 'low' } is ONLY in the else branch — so when web:true (research/strategy), reasoning has no cap and eats the budget, truncating output.

Fix:
1. Move body.reasoning = { effort: 'low' } OUTSIDE the else branch — applies to BOTH web and non-web calls.
2. Bump the default maxTokens parameter in callLLM(system, user, maxTokens, web) to 16000 (raise the floor).
3. Add a one-line comment: "cap reasoning for ALL calls — web/no-web — so it can't starve the output token budget"

Example after-fix shape (modify in place):

  if (web) body.plugins = [{ id: 'web', max_results: Number(process.env.WEB_MAX_RESULTS || 5) }];
  // cap reasoning for ALL calls — web/no-web — so it can't starve the output token budget
  body.reasoning = { effort: 'low' };

## Acceptance
- [ ] db/schema.sql has the new spec_findings table at the end
- [ ] src/dogfood.ts writes to spec_findings for high-severity issues (non-blocking via .catch)
- [ ] src/evolver.ts exists as the stub
- [ ] src/agents.ts reasoning cap is unconditional + max_tokens floor bumped
- [ ] npm test -- src/spec-test.ts still passes
- [ ] npx tsc --noEmit clean (no new type errors)
- [ ] ONE git commit, message: "R2: dogfood capture + evolver stub + max_tokens cap"
- [ ] Co-authored-by trailer: "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"

## Out of scope (hard rules)
- Do NOT wire evolverTick to a cron. It's a stub.
- Do NOT propose spec-schema changes.
- Do NOT touch any file not in this list.
- Do NOT add new dependencies.
- Do NOT polish the demo site.
- Do NOT modify the OpenRouter model name.
- Do NOT push to github (zoro handles push).

## When done
Print a 5-line summary to stdout:
1. commit hash + subject
2. npm test result
3. tsc --noEmit result
4. files changed (count)
5. any anomalies

That's it. Exit.
