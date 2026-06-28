# Relay — technology stack review (fresh eyes, 100 → 1000 users)

Not "optimise what's here" — question what should exist. Trigger: chromium breaks repeatedly.

## Current stack (grounded)
- **Runtime:** Node 22 + `tsx` (TypeScript run directly, no build step). Deps: `pg`, `nodemailer`, `ws`.
- **Web:** raw `node:http` (no framework) on `:8787`.
- **Scheduler:** ONE in-process `runLoop` per project, fire-and-forget *inside the web server*, `runnerId='runner-1'`. Postgres-as-queue (`FOR UPDATE SKIP LOCKED` + leases + unblock trigger).
- **DB:** one Postgres (docker `ap-pg`) on a **shared box**, one `pg.Pool(max:8)` in the server process.
- **Browser:** **chromium spawned per-call** in 3 paths — `site_renders` screenshots EVERY page build · QA vision screenshots · dogfood (hand-rolled CDP over `ws`).
- **Artifacts:** produced sites on **local disk** (`sites/`, 228 MB, gitignored, ephemeral).
- **LLM:** MiniMax (OpenAI-compatible). **Hosting:** shared box, cloudflared tunnel, systemd.

## The chromium decision (the trigger) — two hard calls

**1. Remove chromium from the verify hot path.** `site_renders` spawns chromium to screenshot every page and prove "it isn't blank." But pages are now **deterministically composed from vetted components** — structure, CSS, fonts, contrast are correct *by construction*, and we already statically assert structural HTML · no external assets · no dead buttons · valid inline JS, with `theme:check` parsing the CSS/JS. The screenshot is **redundant theatre**: it can only fail if our own vetted CSS blanks the page, which the deterministic renderer + `theme:check` already preclude. → **Drop the screenshot from `site_renders`; keep the static gates.** Chromium leaves every build. (Keep ONE best-effort thumbnail for the board, generated off the hot path, non-gating.) This is the biggest single fragility + throughput + cost win.

**2. The browser work that genuinely needs a browser (QA vision + dogfood interaction) → Playwright with ONE persistent browser.** The breakage isn't "chromium" per se — it's *spawn-per-call on a snap chromium with hand-rolled CDP*: startup races, navigation crashes, file-write sandboxing, the concurrency starvation I just band-aided by serialising. Playwright bundles its own Chromium (no snap), manages the browser lifecycle, auto-waits, isolates a context/page per review, and is the industry-standard robust tool — it deletes exactly these failure modes. Run **one long-lived browser**, a context per review, a small concurrency limit. (Hand-rolled CDP was a mistake — built to avoid a dependency; the dependency is the right answer.)
- *Higher-scale alternative:* a **managed browser/screenshot service** (browserless · Playwright-as-a-service · screenshotone/urlbox) — offloads the browser entirely. Right when local browser cost/ops outgrows one host; for 100–1000 users, self-hosted Playwright + 1 persistent browser on a sized box is enough and cheaper.

## 100 → 1000 users — the rest of the stack
- **Split the runner OUT of the web server into N stateless worker processes.** The architecture already supports it (Postgres queue + `SKIP LOCKED` + leases + the SPEC's `worker_slots` semaphore). Today "fire-and-forget `runLoop` in the API process" couples build load to the API and is the throughput ceiling (builds are minutes of LLM + render). → thin API + a worker pool claiming from Postgres; give each worker a unique `runnerId`. **Decision: do this when concurrent builds exceed ~a dozen.**
- **Postgres: keep it (right choice).** Add **pgbouncer** (a pool of 8 in one process won't survive N workers), move to **managed Postgres** (Supabase/Neon/RDS) off the shared box. Per-project `app_<id>` schemas are fine into low-thousands; watch catalog growth, revisit a dedicated "apps" DB if it bloats.
- **Artifacts → object storage (Cloudflare R2 / S3).** Required for stateless multi-worker + durability (a box loss today loses every produced site). Produced HTML is self-contained → trivial blobs.
- **Hosting → off the shared box** onto a dedicated host/container sized for builds + one browser (the chromium contention is a symptom of the shared, constrained box), behind the existing Cloudflare tunnel.
- **LLM → provider abstraction + a global concurrency/budget governor** (`worker_slots`); builds are LLM-bound, so LLM limits/cost/latency are the real 1000-user ceiling.
- **Keep as-is:** Postgres-as-queue (excellent), raw `http` server (lean), the deterministic renderer + schema compiler, the per-project isolated schema, `tsx` (fine at this scale; add `esbuild` only if cold-start matters).

## What shouldn't exist (kill, don't optimise)
1. Per-build chromium screenshot gate → **remove** (deterministic render made it redundant).
2. Hand-rolled CDP client → **replace with Playwright** + one persistent browser.
3. `runLoop` inside the web process → **split into workers**.
4. Local-disk artifacts → **object storage**.

## Recommended sequence
1. **Now (kills the pain, no rewrite):** remove the screenshot from `site_renders`; move QA + dogfood to Playwright + a single persistent browser. Eliminates the recurring breakage across every build and makes the reviewer robust.
2. **Next (scale to 1000):** artifacts → R2; runner → worker processes; managed Postgres + pgbouncer; dedicated host.
3. **Later:** managed browser service if local browser ops outgrow one box; LLM governor tuning.
