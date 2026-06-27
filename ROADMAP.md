# Relay — Roadmap & History

Where we've been, where we are, where we're going. See [`MISSION.md`](MISSION.md) for the principles and [`docs/SPEC.md`](docs/SPEC.md) for the architecture.

**Today:** a brief → an autonomous pipeline → a real, **multi-page**, modern, render-verified website served at `/sites/:id/`. Every step is checked by a deterministic gate (it never ships broken). Live at **board.naples.agency**.

---

## History (what shipped, in order)

| Phase | What | Status | Marker |
|---|---|---|---|
| 0 · Engine | DAG board in Postgres, stateless restart-safe runner, unblock trigger, zero-trust verify | ✅ | first commits |
| 1 · Real product | Deliverable-first web app (Your sites → project workspace → live site iframe), `/sites/:id`, live board | ✅ | `a3ea137` |
| 2 · Honest quality | Quality gate (no external/broken assets, no placeholders), render check, **honest KPIs** (deadlock ≠ "running"), retry-with-feedback | ✅ | `5310d30` |
| 3 · Generic + multi-page | LLM planner (per-brief task DAG, not a template), **multi-page sites + shared nav** (one render-verified build per page), WCAG always-bound | ✅ | `v0.2-multipage` |
| 4 · Excellence layer | Vendored Tailwind v4 → compile + inline per page; **real fonts shipped inline** (base64 WOFF2). Kills the "1998 HTML" look. | ✅ | `a4d36a6` |

### Verification today (what "done" means — never the agent's word)
`site_renders` (headless chromium screenshot must be non-blank, valid HTML, no external/placeholder assets) · `wcag` (declared text/bg pair ≥ 4.5:1) · `json` (structured IA/copy parses) · `min:N` (length floor). Rigor is reported honestly.

---

## Where we're moving (forward roadmap)

> Source: the grounded build-stack decision (`docs/RELAY-STACK-DECISION.md`).

### Phase 5 — Stack router  ⟵ NEXT
A deterministic keyword classifier in the planner picks a **stack per brief** and writes `params.archetype`/`params.stack`.
- **Stack A (default):** Designed-Inline-HTML + Tailwind excellence (marketing, brochure, portfolio, catalog).
- **Stack B:** **Eleventy** for blog / content / docs — agents emit Markdown, the SSG owns layout (shared cached `node_modules`, new `ssg_builds` verify = build exits 0).

### Phase 6 — Real media (images + video)
Free stock via **Pexels** (photos + video): a `media` step searches per section, **downloads assets into the project workspace and serves them locally** (gate-safe, never a broken external link). Optional AI-gen later (Magnific/Replicate, paid).

### Phase 7 — CMS / editable
A `pages`/`blocks` content model in Relay's own Postgres (the source of truth). Owner edits content; **republish = re-enqueue that page's build** through the same verified path. Content separate from render.

### Deferred (only when a brief truly needs it)
Astro · a real headless CMS (Directus/Payload/Strapi) · payments/store · app-shell.

---

## Principles (unchanged)
Autonomous (brief in → result out, no human in the loop) · zero-trust (a deterministic check decides "done") · real artifacts (a site you can open) · generic (any brief) · honest (the dashboard never lies).
