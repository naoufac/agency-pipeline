# Relay — Progress Log

**owner:** Zoro (Nao primary agent) · **started:** 2026-06-28
**goal:** ship the validated build-spec contract keystone + the evolution-loop foundation. no half-ass, no quick-fix-then-redo.

---

## 2026-06-28 — Day 1: onboarding + recon

### access established
- SSH key ed25519 added to `/root/.ssh/authorized_keys` (perms 600)
- Hardened sshd (password auth off, root key-only, fail2ban active)

### recon summary (server: Anouf / 135.181.44.161)
- Linux 6.8.0-110-generic · Ubuntu · up 55d · 10 users · load 0.30
- `/root/agency-pipeline/` — real, 29KB AGENTS.md, MISSION.md, src/, db/, deploy/, docs/, eval/ (created 06-28 08:42), node_modules installed, .env mode 600, .git active (last commit Jun 28 09:09)
- Running services:
  - `relay.service` (port 8787) — the actual app
  - `relay-tunnel.service` — cloudflared dedicated tunnel
  - `anouf-named-tunnel.service` — Anouf Chat tunnel
  - `ap-pg` Docker container (Postgres 16, port 5439, 37h uptime)
  - `nao-grok:latest` Docker container — TODO investigate
  - saiid-wp-{caddy,wordpress,db} — sibling WordPress stack
  - searxng (port 8889) — privacy search
- `/opt/claude-worker/claude` — **Claude Code v2.1.170** (the actual binary to manage). NOT in PATH.
- `/root/.claude/`, `/root/.claude-flow/`, `/root/.claude.json` — Claude config + session state + flow project
- `/root/build_planners.py`, `/root/build_covers.py` — Python planner experiments

### claude code v2.1.170 — capabilities for management
- `-p / --print` → non-interactive output (headless orchestration)
- `--allowedTools` → restrict tool access (anti-divergence)
- `--add-dir` → scope file access
- `--append-system-prompt` → inject keystone context without polluting default
- `--bare` → skip auto-memory, hooks, keychain reads (minimal/sandboxed)
- `--agents <json>` → custom sub-agents
- `--model` → swap model on the fly
- settings via `--settings` for API key helper

### plan for today (the brief)
The 5-task execution brief lives at `/root/.openclaw/workspace/agency-pipeline-execution-brief.md` (nao-grok, 12KB). Targets, in order:
1. **task 1** — `src/spec-schema.json` (JSON Schema draft-07)
2. **task 2** — `src/spec.ts` validator + `src/spec.test.ts` (pure function, unit-tested)
3. **task 3** — wire validator into `src/runner.ts` before `render.ts`
4. **task 4** — tighten `site_renders` in `src/verify.ts` (3 new checks)
5. **task 5** — capture dogfood findings → `db/migrations/003-spec-findings.sql` + `src/evolver.ts` stub

### discipline (anti-drift)
- ONE file scope per claude invocation
- ALWAYS diff review before merge
- divergence metric: `(lines changed outside scope) / (lines changed total)` — kill if >10%
- NO polishing the website during system work — separate tasks, separate briefs
- `--bare` mode by default (no auto-memory surprise)
- every claude run is logged here in PROGRESS.md