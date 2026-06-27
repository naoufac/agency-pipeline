// Relay SPA — one app, shared shell, hash router. No scattered pages.
const COLOR = { blocked:'#5C6678', ready:'#E0B341', running:'#5A8DEE', verifying:'#A06CD5', done:'#36B37E', failed:'#F0506E' };
const app = document.getElementById('app');
let viewId = null;        // project shown on the dashboard (null = latest)
let net = null, nodes = null, edges = null, known = new Set(), pollTimer = null;

const j = (u, o) => fetch(u, o).then(r => r.json());
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function stopPoll(){ if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } net = null; nodes = null; edges = null; known = new Set(); }

/* ---------------- pages ---------------- */
function dashboard(){
  app.innerHTML = `
  <div class="container">
    <section class="hero">
      <span class="eyebrow">● live · autonomous</span>
      <h1>Briefs in.<br>Shipped work out.</h1>
      <p class="lead">Hand Relay a brief. A planner explodes it into a dependency graph of department-agents — research, branding, build, QA — that run stage by stage, each one verified before the next begins.</p>
      <div class="brief-bar">
        <input id="brief" class="input" placeholder="e.g. build a food delivery app for Lebanon" />
        <button id="go" class="btn">Run the agency →</button>
      </div>
    </section>

    <div class="board-head">
      <h3 id="blabel">Latest build</h3>
      <span id="counts" class="pill"></span>
      <div class="legend">
        ${Object.keys(COLOR).map(k=>`<span><i class="dot s-${k}"></i>${k}</span>`).join('')}
      </div>
    </div>
    <div id="net"></div>
  </div>`;

  document.getElementById('go').onclick = submitBrief;
  document.getElementById('brief').addEventListener('keydown', e => { if (e.key === 'Enter') submitBrief(); });
  initBoard();
  tick();
  pollTimer = setInterval(tick, 1000);
}

async function submitBrief(){
  const input = document.getElementById('brief');
  const brief = input.value.trim(); if (!brief) return;
  const btn = document.getElementById('go'); btn.textContent = 'Planning…'; btn.disabled = true;
  try { const r = await j('/api/run', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ brief }) });
        viewId = r.id; known = new Set(); if (nodes) { nodes.clear(); edges.clear(); } input.value=''; }
  catch(e){}
  btn.textContent = 'Run the agency →'; btn.disabled = false;
}

function initBoard(){
  nodes = new vis.DataSet(); edges = new vis.DataSet();
  net = new vis.Network(document.getElementById('net'), { nodes, edges }, {
    layout:{ hierarchical:{ direction:'LR', sortMethod:'directed', levelSeparation:210, nodeSpacing:92 } },
    physics:false,
    nodes:{ shape:'box', widthConstraint:{ maximum:178 }, margin:11, borderWidth:0,
            shapeProperties:{ borderRadius:10 }, font:{ color:'#fff', size:13, face:'Inter', multi:false } },
    edges:{ arrows:'to', color:{ color:'#2A3346', highlight:'#7C7AFF' }, smooth:{ type:'cubicBezier', roundness:.55 } },
    interaction:{ hover:true, zoomView:true, dragView:true }
  });
}

async function tick(){
  if (!nodes) return;
  let d; try { d = await j('/api/board' + (viewId ? '?id='+viewId : '')); } catch { return; }
  const lbl = document.getElementById('blabel'), cs = document.getElementById('counts');
  if (!d.project){ if (lbl) lbl.textContent = 'No builds yet — give Relay a brief above.'; return; }
  if (lbl) lbl.textContent = d.project.brief;
  const c = {}; d.tasks.forEach(t => c[t.status]=(c[t.status]||0)+1);
  if (cs) cs.innerHTML = `<span class="count">${c.done||0}</span>&nbsp;/&nbsp;${d.tasks.length} done` + (c.failed?` · ${c.failed} failed`:'');
  d.tasks.forEach(t => {
    const n = { id:t.seq, label:`#${t.seq}  ${t.department}\n${t.title}`, color:{ background:COLOR[t.status]||'#555', border:'#0A0C12' } };
    if (known.has(t.seq)) nodes.update(n); else { nodes.add(n); known.add(t.seq); }
  });
  d.edges.forEach(e => { const id='e'+e.from+'_'+e.to; if (!edges.get(id)) edges.add({ id, from:e.from, to:e.to }); });
}

async function projects(){
  app.innerHTML = `<div class="container section"><h2>Projects</h2><p class="muted" style="margin-top:8px">Every brief Relay has run.</p><div id="plist" class="grid grid-3" style="margin-top:32px"></div></div>`;
  const list = await j('/api/projects'); const wrap = document.getElementById('plist');
  if (!list.length){ wrap.innerHTML = `<div class="empty">No projects yet. Start one from the Dashboard.</div>`; return; }
  wrap.innerHTML = list.map(p => {
    const pct = p.total ? Math.round(100*p.done/p.total) : 0;
    const st = p.failed ? 'failed' : (p.active ? 'running' : (p.done===p.total && p.total ? 'done' : 'ready'));
    return `<a class="card proj" href="#/" data-open="${p.id}">
      <span class="pill"><i class="dot s-${st}"></i>${st}</span>
      <div class="brief" style="margin-top:12px">${esc(p.brief)}</div>
      <div class="muted" style="font-size:13px">${p.done}/${p.total} tasks${p.failed?` · ${p.failed} failed`:''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </a>`; }).join('');
  wrap.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', () => { viewId = a.getAttribute('data-open'); }));
}

function about(){
  app.innerHTML = `<div class="container section"><div class="prose">
    <span class="eyebrow">About Relay</span>
    <h1 style="margin-top:16px">An agency that runs itself.</h1>
    <p style="margin-top:16px">Relay is an autonomous creative + engineering agency. You give it a brief; it delivers shipped work — not a to-do list. Under the hood it mimics how a real studio passes a project desk to desk, but every hand-off is a machine step that proves itself before the next one starts.</p>

    <h2>How it works</h2>
    <div class="steps">
      <div class="step"><div><b>1 · Plan</b><span class="muted">A planner reads the brief and explodes it into a dependency graph of tasks — who depends on whom.</span></div></div>
      <div class="step"><div><b>2 · Run, stage by stage</b><span class="muted">Independent tasks run in parallel; dependent ones wait. Finishing a task unblocks the next — work routes between departments like a real agency.</span></div></div>
      <div class="step"><div><b>3 · Verify, never trust</b><span class="muted">A task is only “done” when a deterministic check passes — a build runs, a schema applies, a test goes green. An agent’s word counts for nothing.</span></div></div>
      <div class="step"><div><b>4 · Ship</b><span class="muted">Real artifacts, assembled and accepted automatically. Brief in, shipped work out.</span></div></div>
    </div>

    <h2>Principles</h2>
    <p><b style="color:var(--text)">Autonomous.</b> No human in the loop — brief in, result out.<br>
       <b style="color:var(--text)">Zero-trust.</b> Completion is proven by checks the model can’t fake.<br>
       <b style="color:var(--text)">Real output.</b> Code and artifacts, not descriptions.</p>
    <p style="margin-top:32px"><a class="btn" href="#/">Give Relay a brief →</a></p>
  </div></div>`;
}

/* ---------------- router ---------------- */
const routes = { '/':dashboard, '/projects':projects, '/about':about };
function router(){
  stopPoll();
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.getAttribute('data-route') === path));
  (routes[path] || dashboard)();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);
router();
