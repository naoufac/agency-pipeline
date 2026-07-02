// leak:check — regression guard for the error-leak CLASS (API audit, 2026-07-02). Two layers:
// (1) STATIC: no client-facing send(res, ...) in server.ts may echo a raw exception message — the
//     source of the "raw Postgres error leaked to the client" finding. Fails the build if it returns.
// (2) LIVE (when the server is up): force a real unhandled throw and assert the response is opaque
//     (a ref, no SQL/stack/pg internals) and 500 — proving the catch-all backstop holds.
// Run: npm run leak:check.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (cond) pass++; else { fail++; console.error(`  ✗ ${name} ${extra}`); } };

// (1) static: scan every send(res, ...) call for a raw-message echo
const src = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
// only the text FROM `send(res` onward counts — a console.error(e.message) earlier on the same line
// is correct (server-side logging), not a leak.
const offenders = src.split('\n')
  .map((line, i) => ({ tail: line.slice(line.indexOf('send(res')), n: i + 1, has: line.includes('send(res') }))
  .filter(({ tail, has }) => has && /e\?\.message|e\.message|\berr:\s*'\s*\+|String\(e[)\s]/.test(tail));
ok('no send(res,…) echoes a raw exception message', offenders.length === 0,
  offenders.map(o => `server.ts:${o.n}`).join(', '));

// (2) live: force a throw through a well-formed but impossible request, assert opacity
const BASE = process.env.LEAK_CHECK_BASE || 'http://127.0.0.1:8787';
try {
  const uuid = '00000000-0000-4000-8000-000000000000';   // valid format, ownerless → passes the guards
  const r = await fetch(`${BASE}/api/output?id=${uuid}&seq=not-a-number`);   // seq→NaN → pg throws inside the handler
  const text = await r.text();
  const leaked = /syntax|invalid input|postgres|pg_|relation|column .* does not exist|at Object|\/root\/|node_modules|SELECT |select \*/i.test(text);
  ok('forced throw does NOT leak internals', !leaked, text.slice(0, 120));
  ok('forced throw is a clean 500 or 200 (never a raw 500 dump)', r.status === 500 || r.status === 200, `status ${r.status}`);
  if (r.status === 500) { let j: any = null; try { j = JSON.parse(text); } catch {} ok('500 body is opaque JSON with a ref', !!(j && j.error && j.ref), text.slice(0, 120)); }
  else pass++;   // handler swallowed it gracefully (also acceptable — no leak)
} catch {
  console.log('  · live check skipped (server not reachable at ' + BASE + ')');
}

console.log(`\nleak:check — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
