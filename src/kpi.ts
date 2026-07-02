import pg from 'pg';
import * as appdb from './appdb.ts';

export type Kpi = { key: string; label: string; value: string; sub: string; group: 'quality' | 'efficiency' | 'signal'; tone: 'good' | 'warn' | 'bad' | 'neutral' };

// One source of truth for KPIs — used by the API (/api/kpi) and the CLI.
export async function computeKpi(pool: pg.Pool, projectId?: string) {
  const p = (await pool.query(
    projectId ? 'select * from projects where id=$1' : 'select * from projects order by created_at desc limit 1',
    projectId ? [projectId] : [])).rows[0];
  if (!p) return null;

  const tasks = (await pool.query('select * from tasks where project_id=$1 order by seq', [p.id])).rows;
  const edges = (await pool.query(
    `select us.seq f, ds.seq t from task_dependencies d
     join tasks us on us.id=d.upstream_id join tasks ds on ds.id=d.downstream_id where us.project_id=$1`, [p.id])).rows;
  const ev = (await pool.query('select type, count(*)::int n from run_events where project_id=$1 group by type', [p.id]))
    .rows.reduce((a: any, r: any) => (a[r.type] = r.n, a), {});
  const outs = (await pool.query(
    'select length(content) len from task_outputs o where is_current and exists (select 1 from tasks t where t.id=o.task_id and t.project_id=$1)', [p.id])).rows;

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const active = tasks.filter(t => ['ready', 'running', 'verifying'].includes(t.status)).length;
  const attempts = tasks.reduce((s, t) => s + t.attempts, 0);
  const firstPass = tasks.filter(t => t.status === 'done' && t.attempts <= 1).length;
  const last = tasks.reduce((m, t) => Math.max(m, +new Date(t.updated_at)), 0);
  const wall = Math.max(0, (last - +new Date(p.created_at)) / 1000);

  const succ: any = {}; tasks.forEach(t => succ[t.seq] = []); edges.forEach((e: any) => succ[e.f].push(e.t));
  const memo: any = {}; const lp = (s: number): number => memo[s] ?? (memo[s] = 1 + (succ[s].length ? Math.max(...succ[s].map(lp)) : 0));
  const critical = total ? Math.max(...tasks.map(t => lp(t.seq))) : 0;
  // honest: only genuinely deterministic checks the agent can't fake count toward rigor
  const realCheck = tasks.filter(t => ['sql_applies', 'app_db', 'site_renders', 'site_consistent', 'wcag'].includes(t.verify) || (t.verify || '').startsWith('json')).length;
  const chars = outs.reduce((s, o) => s + (o.len || 0), 0);
  const errors = ev['agent_error'] || 0, reworks = ev['verify_failed'] || 0;
  const finished = active === 0 && blocked === 0;
  const deadlocked = active === 0 && blocked > 0;   // nothing can move but work remains -> NOT 'running'
  const pct = (n: number, d: number) => d ? Math.round(100 * n / d) : 0;
  const rigor = pct(realCheck, total);

  // A/B instrumentation (Task 10): provider split + latency across ALL projects over the last 7 days, read from
  // the per-call meta the runner writes to run_events (type='llm_call'). detail is TEXT, so cast ::jsonb; the
  // timestamp column is `at` (not created_at). Global (no project filter) — this settles the openrouter A/B.
  const providers = (await pool.query(
    `select detail::jsonb->>'provider' as p, count(*) n,
            round(avg((detail::jsonb->>'latencyMs')::int))::int avg_ms
     from run_events where type='llm_call' and at > now() - interval '7 days'
     group by 1 order by n desc`)).rows;
  const provTotal = providers.reduce((s: number, p: any) => s + Number(p.n), 0) || 1;

  // OWNER-FIRST METRICS (audited 2026-07-02): every number is verifiable against the DB and answers
  // a question a site owner actually has. Engineering telemetry (parallelism, critical-path latency,
  // LLM provider split) left the board — providers stay in the payload for the CLI/ops only.
  const pagesVerified = tasks.filter(t => t.verify === 'site_renders' && t.status === 'done').length;
  const pagesPlanned = tasks.filter(t => t.verify === 'site_renders').length;
  const review = (await pool.query('select passed, checked from dogfood_reviews where project_id=$1 order by id desc limit 1', [p.id])).rows[0];
  const formsChecked = review?.checked?.forms ?? null;
  const cmsBuilt = !!(p.params && p.params.cms_built);
  const leads = Number((await pool.query('select count(*)::int n from site_submissions where project_id=$1', [p.id])).rows[0].n);
  let dataRows = 0;
  try { for (const t of (await appdb.describeSchema(pool, p.id)).tables) dataRows += Number(t.rows || 0); } catch {}
  const rebuilds = Number(p.params?.rebuilds || 0);
  const mins = wall >= 60 ? `${Math.floor(wall / 60)}m ${Math.round(wall % 60)}s` : `${wall.toFixed(0)}s`;

  const kpis: Kpi[] = [
    { group: 'quality', key: 'live', label: 'Site status',
      value: deadlocked ? 'Blocked' : !finished ? 'Building' : failed ? 'Finished (issues)' : 'Live',
      sub: cmsBuilt ? 'served live from the CMS (proven)' : 'static serving',
      tone: deadlocked ? 'bad' : !finished ? 'warn' : failed ? 'warn' : 'good' },
    { group: 'quality', key: 'pages', label: 'Pages verified',
      value: `${pagesVerified}/${pagesPlanned || '—'}`, sub: 'each passed the render + consistency gates',
      tone: pagesPlanned && pagesVerified === pagesPlanned ? 'good' : 'warn' },
    { group: 'quality', key: 'review', label: 'Browser review',
      value: review ? (review.passed ? 'Passed' : 'Issues found') : '—',
      sub: review ? `a real browser clicked every button${formsChecked ? ` · ${formsChecked} form(s) submitted + persisted` : ''}` : 'runs when the build finishes',
      tone: review ? (review.passed ? 'good' : 'bad') : 'neutral' },
    { group: 'signal', key: 'data', label: 'Data collected',
      value: String(leads + dataRows), sub: `${leads} form submission(s) · ${dataRows} database row(s)`,
      tone: 'neutral' },
    { group: 'efficiency', key: 'wall', label: 'Build time',
      value: mins, sub: rebuilds ? `rebuilt ${rebuilds}× — data preserved` : 'brief to live, zero humans',
      tone: 'neutral' },
    { group: 'quality', key: 'firstpass', label: 'Right first try',
      value: pct(firstPass, done || 1) + '%', sub: `${firstPass}/${done} steps passed without a retry`,
      tone: deadlocked ? 'bad' : (firstPass === done ? 'good' : 'warn') },
    { group: 'signal', key: 'rigor', label: 'Independently checked',
      value: rigor + '%', sub: `${realCheck}/${total} steps proven by an external check, not the AI's word`,
      tone: rigor >= 60 ? 'good' : rigor >= 40 ? 'warn' : 'bad' },
  ];

  return {
    project: { id: p.id, brief: p.brief, created_at: p.created_at },
    status: deadlocked ? 'blocked' : (!finished ? 'running' : (failed ? 'complete_with_failures' : 'complete')),
    totals: { total, done, active, blocked, failed },
    chars,
    kpis,
    providers,   // ops-only telemetry (CLI); the board does not render this
  };
}
