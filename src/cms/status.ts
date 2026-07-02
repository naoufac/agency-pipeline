// Live CMS status: pings the adapter's healthcheck and prints the real state.
// Run: npm run cms:status. Honest by construction — a failing healthcheck prints its blocker.
import { REGISTRY, CMS_ORDER } from './registry.ts';
import type { CmsInstance } from './types.ts';

async function main() {
  console.log('\nCMS — live status (ONE CMS: Directus, see GOAL.md):\n');
  let buildable = 0;
  for (const name of CMS_ORDER) {
    const e = REGISTRY[name];
    let health = { ok: false, detail: '' };
    try { health = await e.adapter.healthcheck({ cms: name } as CmsInstance); } catch (err: any) { health = { ok: false, detail: String(err?.message ?? err) }; }
    const mark = health.ok ? '✅ BUILDABLE' : '⛔ DOWN     ';
    if (health.ok) buildable++;
    console.log(`  ${mark}  ${name.padEnd(9)} — ${health.ok ? health.detail : (health.detail || e.note)}`);
  }
  console.log(`\n  ${buildable}/${CMS_ORDER.length} buildable right now.\n`);
  if (buildable < CMS_ORDER.length) process.exit(1);
}
main();
