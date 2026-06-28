# Task 7 — content dept reliability fix

content dept (src/agents.ts ROLE map, around line 39) retries 93% — worst dept. Root cause: "Output ONLY ONE valid JSON object (a single object — never two blocks)" instruction violated by model.

4 files. ~40 lines. ONE commit.

## Step 1: Investigate
- Read src/agents.ts (find ROLE.content)
- Read src/spec.ts (extractFirstJson)
- Query postgres for content failures:
  ```
  psql $DATABASE_URL -c "select type, detail from run_events where type='agent_error' and detail ilike '%content%' order by at desc limit 10;"
  ```
- Optionally: look at task_outputs table for content dept samples

## Step 2: Fix in 4 files

### File 1: src/agents.ts (rewrite ROLE.content)
Current: "You are the Content department. Output ONLY ONE valid JSON object (a single object — never two blocks). For sitemap/IA: {sections:[...]}. For copy: {hero:{...}, ...}. ..."
Rewrite to make single-shape explicit + add self-check. Either:
(a) split into `content:ia` (sitemap) + `content:copy` (page copy) — TWO roles
(b) keep `content` but add `Self-check: count your { and }. They must match. Your output must be EXACTLY one JSON object — no second block, no prose before/after.`

Pick (a) if planner can emit two task types; (b) otherwise. Either is fine.

### File 2: src/spec.ts — add normalizeContent(raw)
After extractFirstJson:
```ts
export type ContentResult = { ok: true; spec: any; repairs: string[] } | { ok: false; errors: string[] };
export function normalizeContent(raw: string): ContentResult {
  const repairs: string[] = []; const errors: string[] = [];
  if (!raw) { errors.push('empty content output'); return { ok: false, errors }; }
  // first pass: standard extractFirstJson
  const first = extractFirstJson(raw);
  if (first !== undefined && first !== null) return { ok: true, spec: first, repairs: [] };
  // second pass: try to merge two concatenated objects
  const blocks: any[] = [];
  const re = /\{[^{}]*\}/g;  // naive — top-level only
  let m; while ((m = re.exec(raw)) !== null) { try { blocks.push(JSON.parse(m[0])); } catch {} }
  if (blocks.length === 0) { errors.push('no valid JSON object in content output'); return { ok: false, errors }; }
  // merge if multiple
  if (blocks.length > 1) {
    repairs.push(`merged ${blocks.length} concatenated JSON objects`);
    const merged: any = {};
    for (const b of blocks) {
      if (b && typeof b === 'object') Object.assign(merged, b);
    }
    return { ok: true, spec: merged, repairs };
  }
  errors.push('content output has braces but no valid object');
  return { ok: false, errors };
}
```

### File 3: src/spec-test.ts — add 5 cases
- valid single object → passes
- 2 concatenated sitemap + copy objects → merged
- 1 valid + 1 invalid → first kept
- empty string → rejected
- truncated `{` no closing → rejected

### File 4: src/runner.ts — wire normalizeContent
In processTask where content dept output is validated, BEFORE normalizeSpec:
```ts
if (task.department === 'content') {
  const r = normalizeContent(content);
  if (!r.ok) throw new Error('content rejected: ' + r.errors.join('; '));
  for (const rep of r.repairs) console.error(`[content] ${task.project_id}: ${rep}`);
  content = JSON.stringify(r.spec);  // feed normalized JSON to next stage
}
```

## Acceptance
- [ ] npm test -- src/spec-test.ts passes
- [ ] npx tsc --noEmit clean
- [ ] ONE commit: "R3: content dept reliability — role rewrite + normalizeContent"
- [ ] Co-authored-by: Claude Opus 4.8
- [ ] root-cause finding reported in summary

## Out of scope
- Do NOT touch other depts
- Do NOT modify the planner
- Do NOT change the json verify rule
- Do NOT add dependencies

## When done: 5-line summary
1. commit hash + subject
2. npm test
3. tsc
4. files changed (count)
5. root-cause finding
