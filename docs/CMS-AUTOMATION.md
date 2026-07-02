# CMS Automation — ONE pipeline, ONE CMS (decision of 2026-07-02)

**Superseded:** this document previously defined a forced use-case→CMS routing table
(WooCommerce for ecom, WordPress for general/design, Drupal for multilingual, …) powering a
separate `/api/cms-run` build path. That whole design is **retired by owner decision** — it created
a second build system that bypassed the planner, verification, and QA, and shipped inconsistent
designs. See `GOAL.md` for the standing goal.

## How CMS automation works now
There is exactly one build flow and exactly one CMS:

1. `POST /api/run` (the board's only build button) → `plan()` writes the task DAG;
   `params.cms` is **hardcoded to `directus`** in `src/planner.ts` — no selector, no rotation.
2. `compose` produces ONE site model; `render` tasks project it deterministically; `verify.ts`
   gates every step.
3. `cmsFinalize` (`src/cms/finalize.ts`, called by the runner after every build) provisions the
   project's namespace on the shared Directus, pushes the model as real CMS content, re-serves the
   site THROUGH the CMS, and runs the `servedFromCms` mutation-sentinel gate. Only a passing gate
   sets `params.cms_built`.
4. `src/cms/live.ts` renders HTML pages fresh from Directus on every request, so CMS edits show
   with no rebuild.

The principle this doc always stood for is unchanged and now fully honored: **code decides the
stack; the LLM only writes words.** The strongest form of "code decides" is no decision at all —
one CMS, forced.

## Proofs (deterministic, external — never an agent's word)
- `npm run cms:check` — the one-CMS invariant: one registry entry, one CmsName, planner hardcode,
  no wordpress/usecase imports, board posts to `/api/run`. Exit 1 on any violation.
- `npm run prove:directus` — real end-to-end: provision → push → serve → sentinel gate → teardown.
- `npm run cms:status` — live healthcheck of the Directus adapter (exit 1 when down).

## Legacy
Six WordPress/WooCommerce sites shipped by the retired path keep serving frozen from the
`relay-wp` container (`sites.naples.agency`); the board renders those projects read-only via their
stored `wp_url`/`wp_admin` params. No new WP sites are ever created. The `relay-drupal` container
serves nothing Relay-built and can be decommissioned.
