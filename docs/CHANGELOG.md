# Relay — Changelog

A running record of shipped advancements. Every entry is backed by a **deterministic check**, not self-report.

## 2026-06-27

### Roadmap 08 — Editable CMS ✅
Edit a page's content and re-publish it through the same verified path.
- **What:** every build now freezes each page's editable HTML (post-media, pre-excellence, with stable `data-edit` ids) in Postgres (`page_snapshots` + `page_blocks`). A new **Edit** tab (`#/p/:id/edit`, mobile-first) lets you change any page's copy block-by-block. **Publish** re-renders just that page by deterministically overlaying the edits onto the frozen snapshot (no LLM — the design cannot drift), runs the IDENTICAL `site_renders` gate against a `<slug>.html.tmp`, and atomically renames it over the live file **only on pass**. `src/cms.ts` holds the core; the build & republish share one finalize path so they can't diverge.
- **Design choice:** the panel disqualified "re-run the build LLM" (temp 0.7 → silent redesign on a one-word edit) and "patch the on-disk file" (`applyExcellence` double-inlines CSS). Frozen-snapshot + string-overlay + atomic `.tmp` swap is the only approach that keeps edits deterministic AND zero-trust.
- **Verified end-to-end:** edited a hero headline → published → live file contains the new text, **only 2 lines changed** (design byte-identical), still passes the gate; a second edit **persisted** the first (dirty-flag fix); a deliberately breaking edit (`[Placeholder]`) was **rejected** with the live page untouched. Mobile editor verified at 390px.
- **v1 scope:** text editing. Photo-swap and inline-styled (read-only) headings are the next increment.


### Roadmap 07 — Email platform ✅
Production email from `noreply@naples.agency`.
- **What:** authenticated SMTP (`nodemailer`, `src/mailer.ts`) through the domain's cPanel mail server, which is in the domain SPF, signs DKIM (default selector), and has DMARC — so mail is inbox-aligned. Wired in as `sendMail`/`verifyMailer` + `npm run mail:test`. (Outbound :25 is blocked on this box, so a self-hosted MTA was never viable — this is the correct production route.)
- **Verified:** `verifyMailer()` → true (SMTP connect+auth over verified STARTTLS); SPF + DKIM + DMARC records present; two live test emails landed in a real Gmail **primary** inbox.

### Roadmap 06 — Real media ✅
Real licensed photography in the sites Relay builds.
- **What:** the build agent names the photo each section needs via `<img data-q="...">`; `src/media.ts` `processMedia` fetches it from **Pexels**, downloads into `sites/<id>/assets/`, and rewrites to a **local** `src` — gate-safe, never a broken link. Existing photos only, no AI generation.
- **Hardening (surfaced by verification):** the build now strips external `<script>`/`<link>` (Tailwind CDN, Google-Fonts preconnect) so pages are self-contained and pass the render gate first-try (so the agent's images survive); content/copy/build agents now invent realistic specifics and never leave `[Placeholder]` copy.
- **Verified:** live builds download real jpgs and embed them locally; pages render with rich photography (full-bleed hero + photo cards) and pass `site_renders` first-pass (0 external, 0 placeholders, 0 retries on the final build).
- **Known caveat (tracked):** photo coverage is reliable on content/feature pages, but the **home-page hero** is still LLM-variable — some builds render it as a gradient instead of a photo despite the mandate. Tightening (a deterministic hero-image guarantee) is the next refinement.

### Infrastructure (this session)
- **Ingress decoupled:** Relay runs on its own dedicated, supervised cloudflared tunnel (`relay-tunnel.service`), separate from the shared tenant tunnel. Crash-tested (kill → 2s respawn).
- **Durability:** `relay.service` + tunnel under systemd `Restart=always`; Postgres `unless-stopped`; daily agency-DB `pg_dump` backups (every 6h, 14 kept); 5-min uptime monitor → Telegram alerts; `/api/run` rate-limited (spend guard).
- **Docs in-product:** live `#/review` (verdicts) and `#/docs` (visual system map) pages, so the work is visible, not buried in files.
