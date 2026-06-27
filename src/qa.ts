// Visual QA runner: screenshot each produced page at mobile + desktop, have the vision model read
// each, and store the score + issues + the screenshot (served from the site dir for the dashboard).
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SITES } from './verify.ts';
import { critique, visionReady } from './vision.ts';
import { ev } from './db.ts';

const VIEWPORTS: [string, string][] = [['mobile', '390,1700'], ['desktop', '1280,1700']];

function snap(pagePath: string, outPath: string, size: string): boolean {
  try {
    execFileSync('chromium-browser', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${size}`, '--virtual-time-budget=7000',
      `--screenshot=${outPath}`, 'file://' + pagePath], { timeout: 40000, stdio: 'ignore' });
    return existsSync(outPath);
  } catch { return false; }
}

// Review every page of a built site (mobile + desktop). Returns {views, worst score}. Never throws.
export async function reviewSite(pool: pg.Pool, projectId: string): Promise<{ views: number; worst: number }> {
  if (!visionReady()) { await ev(pool, projectId, null, 'qa_skipped', 'vision disabled (no GEMINI_API_KEY)'); return { views: 0, worst: 0 }; }
  try {
    const proj = await pool.query('select params from projects where id=$1', [projectId]);
    const pages = (proj.rows[0]?.params?.pages) || [{ slug: 'index', title: 'Home' }];
    const dir = new URL(projectId + '/', SITES);
    await pool.query('delete from qa_reviews where project_id=$1', [projectId]);
    let worst = 10, views = 0;
    for (const p of pages) {
      const artifact = (p.slug === 'index' ? 'index' : p.slug) + '.html';
      const pagePath = fileURLToPath(new URL(artifact, dir));
      if (!existsSync(pagePath)) continue;
      for (const [vp, size] of VIEWPORTS) {
        const shotName = `_qa-${p.slug}-${vp}.png`;
        if (!snap(pagePath, fileURLToPath(new URL(shotName, dir)), size)) continue;
        let c; try { c = await critique(fileURLToPath(new URL(shotName, dir)), vp); }
        catch (e: any) { console.error('qa critique', p.slug, vp, e?.message); continue; }
        await pool.query('insert into qa_reviews(project_id,slug,viewport,score,issues,shot) values($1,$2,$3,$4,$5,$6)',
          [projectId, p.slug, vp, c.score, JSON.stringify(c.issues), shotName]);
        worst = Math.min(worst, c.score || 10); views++;
      }
    }
    await ev(pool, projectId, null, 'qa_reviewed', `${views} views reviewed, worst ${worst}/10`);
    return { views, worst };
  } catch (e: any) { console.error('reviewSite', projectId, e?.message); return { views: 0, worst: 0 }; }
}
