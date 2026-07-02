# Relay — The One Goal (relocked 2026-07-02 · owner-confirmed same day)

**A brief goes in; a real, verified, CMS-served product comes out — from a high-converting
landing page to a full-stack app with a database and user accounts. Zero humans in between.**

The staged path to this goal is **[`PLAN.md`](PLAN.md)** — the plan of record, in owner language,
one milestone at a time, each with a 30-second phone check and a deterministic machine gate.

## ONE pipeline, ONE CMS
Every website Relay generates flows through the SAME pipeline — plan → compose (one site model)
→ deterministic render → verify → CMS finalize → QA — and is built on **one CMS: Directus**.
Content lives in the CMS; pages are served live from it; the `servedFromCms` gate proves it on
every build (a sentinel written through the CMS must surface in the re-served HTML).

This **replaces** the previous "5 CMS integrated, 1 chosen per project" goal (locked 2026-06-28).
That goal is retired, by owner decision: it produced two parallel build systems (the DAG pipeline
vs. a WordPress/WooCommerce generator behind the board's build button), four stub adapters that
could never build, per-brief CMS rotation, and five different designs for the same request.
`npm run cms:check` now fails the build if a second CMS, a selector, or a parallel build endpoint
is ever reintroduced.

## Non-negotiable rules
- **We work ONLY on Relay** — the system that produces websites. Never on a produced website.
  A produced site is fixed by fixing the generator and rebuilding, never by editing its output.
- **Zero human steps between brief and live site.** The only mandatory human action is submitting
  the brief. Recovery, repair, QA and CMS finalization are automatic and budget-bounded.
- **One CMS: Directus, forced in code** (planner hardcodes `params.cms`; the type system allows no
  other name). Adding a CMS back is a deliberate code change with its own end-to-end proof, never
  a runtime choice.
- **Done = a deterministic external check passes**: the live site is genuinely served from the CMS
  and content reads back through it. Never an agent's word, never a self-report, never a label.

## Definition of DONE — corrected 2026-07-02 (owner called out inflated "done"s)
Passing a narrow mechanical gate is NOT done. Earlier milestones were marked "Shipped" because a
sentinel round-tripped or a form field matched a column — while the actual OUTPUT was one template
recolored across every brief, an ecommerce store that cannot sell, and a CMS that is an opaque JSON
blob. That is "work in progress", not success.

**A capability is DONE only when a demanding agency creative director would hand the produced site
to a paying client** — proven on REAL produced output, not on pipeline mechanics. Concretely:
distinct design per brief (not a recolor), working end-to-end flows (a store can actually sell), a
CMS a non-technical client can actually edit. Gates must measure THAT. No monetization, no "sells
itself", until the product clears this bar. See `PLAN.md` → Production Quality track.

## Standing decisions
- The WordPress/WooCommerce "CMS-native" generator (`/api/cms-run`) is retired (HTTP 410). The six
  WP sites it shipped keep serving frozen from their container; the board renders them read-only.
- Drupal/Payload/Sanity/Craft stubs and the per-brief selector are deleted, not parked.
- The old "Editable CMS" (regex overlay on frozen HTML) stays dead. See `docs/HONESTY-AUDIT.md`.
