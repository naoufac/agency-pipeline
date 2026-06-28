# Task 9 — openrouter scope: planner doesn't need web

The planner uses llm(..., { web: true }) but web search adds latency (root cause of the 3.6h p95 planner hang that motivated R4). The planner doesn't need live facts — it just emits a tasks DAG.

1 file. 1 line change + comment. ONE commit.

## File: src/planner.ts

In llmPlan() (around line 105):
- Replace: `let raw = ''; try { raw = await llm(PLANNER_SYS, 'BRIEF: ' + brief, 4000, { web: true }); } catch { return null; }`
- With: `let raw = ''; try { raw = await llm(PLANNER_SYS, 'BRIEF: ' + brief, 4000, { web: false }); } catch { return null; }`
- Add a comment above the line: `// web:false — planner emits a tasks DAG from the brief, doesn't need live web facts. The web plugin adds latency (was the 3.6h p95 root cause pre-R4) and the truncation risk (R2 fix capped reasoning, but web plugin still costs ~5-15s per call). research/strategy keep web:true (the WEB_DEPTS set in agents.ts controls the default; planner explicitly opts in/out here).`

## Acceptance

- [ ] src/planner.ts has web:false with the comment
- [ ] npx tsc --noEmit clean
- [ ] ONE commit: "R5: openrouter scope — planner web:false (kills 3.6h planner hang at the source)"
- [ ] Co-authored-by: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

## Out of scope

- Do NOT touch agents.ts
- Do NOT touch other depts (research keeps web:true, etc.)
- Do NOT change the llm function signature
- Do NOT add force_direct or other params
- Do NOT change the planner's other behavior (fallback, validate, etc.)

## When done

Print 5-line summary:
1. commit hash + subject
2. tsc result
3. files changed (count)
4. lines diff
5. any anomaly (if the planner path is more complex than expected, note it but DO NOT scope-creep)

Exit.
