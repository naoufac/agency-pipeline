// CLI: finalize a project's site onto its CMS and record the proof. Visible on the board afterward.
// Usage: npm run cms:build <projectId> [sitesDir]
//   sitesDir defaults to this process's SITES dir; pass /srv/relay/sites to write into the live board.
import pg from 'pg';
import { cmsFinalize } from './finalize.ts';

const id = process.argv[2];
const sitesDir = process.argv[3];
if (!id) { console.error('usage: npm run cms:build <projectId> [sitesDir]'); process.exit(2); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
cmsFinalize(pool, id, sitesDir).then(async (r) => {
  console.log(JSON.stringify(r, null, 2));
  await pool.end();
  process.exit(r.ok ? 0 : 1);
});
