// dogfood.ts — the reviewer that mimics a human. It drives a REAL Chromium over CDP and actually USES a
// produced site: visits every page at desktop + mobile, measures layout (header alignment, horizontal
// overflow), checks every CTA actually goes somewhere, TYPES into and SUBMITS the form (asserting the
// on-page confirmation AND that the row reached Postgres), and confirms collections render live DB rows.
// This is verification by interaction, not by screenshot — it catches dead buttons / misaligned headers /
// broken forms that a vision pass or static check can miss.
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import pg from 'pg';
import { ev } from './db.ts';

const CHROME = process.env.CHROME_BIN || '/usr/bin/chromium-browser';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export type Issue = { page: string; viewport: string; kind: string; detail: string; severity: 'high' | 'medium' | 'low' };

// ---- minimal CDP client (no puppeteer; drives the system chromium directly) ----
class CDP {
  private ws!: WebSocket; private id = 0; private pending = new Map<number, { res: (v: any) => void; rej: (e: any) => void }>();
  private proc!: ChildProcess; private sessionId?: string; private port = 0;

  async launch() {
    this.port = 9300 + Math.floor(Math.random() * 250);
    this.proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--force-device-scale-factor=1', `--remote-debugging-port=${this.port}`,
      `--user-data-dir=/root/.cache/dogfood-${this.port}`, 'about:blank'], { stdio: 'ignore', detached: true });
    let wsUrl = '';
    for (let i = 0; i < 50 && !wsUrl; i++) { try { const j: any = await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json(); wsUrl = j.webSocketDebuggerUrl; } catch {} if (!wsUrl) await sleep(250); }
    if (!wsUrl) throw new Error('chromium CDP did not come up');
    this.ws = new WebSocket(wsUrl, { maxPayload: 128 * 1024 * 1024 });
    await new Promise<void>((res, rej) => { this.ws.on('open', () => res()); this.ws.on('error', rej); });
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id)!; this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
    await this.send('Page.enable', {}, sessionId);
    await this.send('Runtime.enable', {}, sessionId);
  }
  private send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = ++this.id; const msg: any = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify(msg)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 30000); });
  }
  viewport(width: number, height: number, mobile = false) { return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, this.sessionId); }
  async goto(url: string, settle = 1400) { await this.send('Page.navigate', { url }, this.sessionId); await sleep(settle); }
  async evaluate(expression: string): Promise<any> { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, this.sessionId); return r?.result?.value; }
  close() { try { this.ws?.close(); } catch {} try { process.kill(-(this.proc.pid as number)); } catch {} try { this.proc.kill('SIGKILL'); } catch {} }
}

// ---- in-page probes (run inside the real browser) ----
const LAYOUT = `(()=>{var n=document.querySelector('.nav-inner'),c=document.querySelector('main .container')||document.querySelector('.container');var nl=n?n.getBoundingClientRect().left:null,cl=c?c.getBoundingClientRect().left:null;return{overflow:document.documentElement.scrollWidth>window.innerWidth+2,navLeft:nl,contLeft:cl,misaligned:(nl!=null&&cl!=null)?Math.abs(nl-cl)>2:false}})()`;
const BTNS = `Array.from(document.querySelectorAll('a.btn')).map(a=>({text:(a.textContent||'').trim().slice(0,40),href:a.getAttribute('href')}))`;
const COLLS = `Array.from(document.querySelectorAll('.collection[data-table]')).map(el=>({table:el.getAttribute('data-table'),cards:el.querySelectorAll('.card').length}))`;
const HASFORM = `!!document.querySelector('form.rform')`;
// type into every field + submit for real, then read the confirmation the user would see
const SUBMIT = `new Promise(res=>{var f=document.querySelector('form.rform');if(!f)return res({form:false});f.querySelectorAll('input,textarea').forEach(function(el,i){el.value=(el.type==='email')?'qa@example.com':(el.tagName==='TEXTAREA'?'Automated QA check — please ignore.':'QA Test '+i);el.dispatchEvent(new Event('input',{bubbles:true}))});try{f.requestSubmit?f.requestSubmit():f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))}catch(e){}setTimeout(function(){var m=f.querySelector('.rform-msg');var t=m?(m.textContent||''):'';res({form:true,msg:t.trim(),ok:/thank|got your|received|success/i.test(t)})},3500)})`;

export async function dogfood(pool: pg.Pool, projectId: string, baseUrl = 'http://localhost:8787'): Promise<{ issues: Issue[]; checked: { pages: number; buttons: number; forms: number; collections: number } }> {
  const proj = await pool.query('select params from projects where id=$1', [projectId]);
  const pages = (proj.rows[0]?.params?.pages) || [{ slug: 'index', title: 'Home' }];
  const issues: Issue[] = []; let nButtons = 0, nForms = 0, nColls = 0;
  const cdp = new CDP();
  await cdp.launch();
  try {
    for (const vp of [{ name: 'desktop', w: 1280, h: 900, mobile: false }, { name: 'mobile', w: 390, h: 844, mobile: true }]) {
      await cdp.viewport(vp.w, vp.h, vp.mobile);
      for (const pg of pages) {
        const url = `${baseUrl}/sites/${projectId}/${pg.slug}.html`;
        await cdp.goto(url);
        const lay = await cdp.evaluate(LAYOUT);
        if (lay?.overflow) issues.push({ page: pg.slug, viewport: vp.name, kind: 'overflow', detail: 'page scrolls horizontally (layout overflow)', severity: 'high' });
        if (lay?.misaligned) issues.push({ page: pg.slug, viewport: vp.name, kind: 'header', detail: `header misaligned: nav left ${Math.round(lay.navLeft)} vs content ${Math.round(lay.contLeft)}`, severity: 'medium' });
        const btns = (await cdp.evaluate(BTNS)) || [];
        for (const b of btns) { nButtons++; if (!b.href || b.href === '#' || b.href === '') issues.push({ page: pg.slug, viewport: vp.name, kind: 'dead-button', detail: `CTA "${b.text}" goes nowhere (href="${b.href ?? ''}")`, severity: 'high' }); }
        if (vp.name === 'desktop') {
          for (const c of ((await cdp.evaluate(COLLS)) || [])) { nColls++; if (!c.cards) issues.push({ page: pg.slug, viewport: vp.name, kind: 'empty-collection', detail: `collection "${c.table}" rendered 0 rows (live data not showing)`, severity: 'medium' }); }
        }
      }
    }
    // forms: type + submit on the first page that has one, then prove the row reached Postgres
    await cdp.viewport(1280, 900, false);
    for (const pg of pages) {
      await cdp.goto(`${baseUrl}/sites/${projectId}/${pg.slug}.html`);
      if (!(await cdp.evaluate(HASFORM))) continue;
      nForms++;
      const before = Number((await pool.query('select count(*)::int n from site_submissions where project_id=$1', [projectId])).rows[0].n);
      const r = await cdp.evaluate(SUBMIT);
      await sleep(800);
      const after = Number((await pool.query('select count(*)::int n from site_submissions where project_id=$1', [projectId])).rows[0].n);
      if (!r?.ok) issues.push({ page: pg.slug, viewport: 'desktop', kind: 'form-no-confirm', detail: `form submitted but no success confirmation (saw: "${r?.msg || ''}")`, severity: 'high' });
      if (after <= before) issues.push({ page: pg.slug, viewport: 'desktop', kind: 'form-not-persisted', detail: 'form submission did not reach the database', severity: 'high' });
      // tidy up: remove the QA test submission so the operator's real data stays clean
      await pool.query("delete from site_submissions where project_id=$1 and (data->>'message'='Automated QA check — please ignore.' or data->>'name' like 'QA Test%')", [projectId]).catch(() => {});
      break;
    }
  } finally { cdp.close(); }
  return { issues, checked: { pages: pages.length, buttons: nButtons, forms: nForms, collections: nColls } };
}

// Auto-run on project completion (fire-and-forget). Only when an HTTP server is actually serving the
// site (skips offline CLI/demo runs). Records an honest summary as a run_event the dashboard can show.
export async function dogfoodSite(pool: pg.Pool, projectId: string, baseUrl = 'http://localhost:' + (process.env.PORT || 8787)): Promise<void> {
  try { const h = await fetch(baseUrl + '/healthz'); if (!h.ok) return; } catch { return; }
  try {
    const { issues, checked } = await dogfood(pool, projectId, baseUrl);
    const high = issues.filter(i => i.severity === 'high').length;
    const detail = issues.length
      ? `${issues.length} issue(s), ${high} high — ` + issues.slice(0, 8).map(i => `${i.page}/${i.viewport}:${i.kind}`).join('; ')
      : `clean — ${checked.buttons} buttons go somewhere, ${checked.forms} form(s) submit+persist, ${checked.collections} collection(s) live, header aligned`;
    await ev(pool, projectId, null, 'dogfood', detail);
  } catch (e: any) { await ev(pool, projectId, null, 'dogfood', 'reviewer error: ' + (e?.message ?? e)).catch(() => {}); }
}
