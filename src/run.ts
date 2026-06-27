// Dev CLI: plan a brief and run it to completion. `npm run run -- "your brief"`
// Like the demo it RESETS the schema, so it defaults to an ISOLATED scratch DB and never touches a
// live board. To run against a real board, set DATABASE_URL explicitly (and RESET=0 to append, not wipe).
// Production briefs do NOT use this file — they come through POST /api/run in server.ts (no schema reset).
import { makePool, applySchema, ensureDatabase, board } from './db.ts';
import { plan } from './planner.ts';
import { runLoop } from './runner.ts';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5439/agency_test';
  process.env.ALLOW_DB_RESET = '1';
}

async function main() {
  if (process.env.DATABASE_URL?.endsWith('/agency_test')) await ensureDatabase('agency_test');
  const pool = makePool();
  if (process.env.RESET !== '0') await applySchema(pool);
  const brief = process.argv[2] || 'build a delivery app';
  const projectId = await plan(pool, brief);
  const res = await runLoop(pool, projectId, { cap: 4 });
  console.log(`project ${projectId}: ${res.stopped}`);
  for (const r of await board(pool, projectId)) {
    console.log(`#${String(r.seq).padStart(2)} ${r.status.padEnd(9)} ${r.department.padEnd(12)} ${r.title}`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
