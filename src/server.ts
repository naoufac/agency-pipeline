// Live board: a public web view of the pipeline as a dependency graph that updates in
// real time as the runner works. `npm run serve` (then expose the port with a tunnel).
import http from 'node:http';
import { makePool } from './db.ts';

const pool = makePool();
const PORT = Number(process.env.PORT || 8787);

async function boardJSON(projectId?: string) {
  const p = projectId
    ? await pool.query('select id, brief, status, created_at from projects where id=$1', [projectId])
    : await pool.query('select id, brief, status, created_at from projects order by created_at desc limit 1');
  if (!p.rows.length) return { project: null, tasks: [], edges: [] };
  const proj = p.rows[0];
  const tasks = (await pool.query(
    'select seq, title, department, status from tasks where project_id=$1 order by seq', [proj.id])).rows;
  const edges = (await pool.query(
    `select us.seq as "from", ds.seq as "to"
     from task_dependencies d
     join tasks us on us.id=d.upstream_id
     join tasks ds on ds.id=d.downstream_id
     where us.project_id=$1`, [proj.id])).rows;
  const projects = (await pool.query('select id, brief, created_at from projects order by created_at desc limit 20')).rows;
  return { project: proj, tasks, edges, projects };
}

const HTML = (host: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agency Pipeline — live board</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box} html,body{margin:0;height:100%;background:#0B132B;color:#E8EAF0;font-family:Inter,system-ui,sans-serif}
  header{padding:12px 18px;border-bottom:1px solid #1f2a44;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  h1{font-size:15px;margin:0;font-weight:800;letter-spacing:.2px}
  #brief{font-size:13px;color:#9fb0d0;max-width:60ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .legend{margin-left:auto;display:flex;gap:12px;font-size:12px;color:#aab4cc;flex-wrap:wrap}
  .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  #net{position:absolute;top:54px;left:0;right:0;bottom:0}
  #stat{font-size:12px;color:#7fd4a8}
</style></head><body>
<header>
  <h1>🏭 Agency Pipeline</h1>
  <span id="brief">…</span>
  <span id="stat"></span>
  <span class="legend">
    <span><i class="dot" style="background:#9aa0a6"></i>blocked</span>
    <span><i class="dot" style="background:#E9B44C"></i>ready</span>
    <span><i class="dot" style="background:#457B9D"></i>running</span>
    <span><i class="dot" style="background:#7B2D8E"></i>verifying</span>
    <span><i class="dot" style="background:#2D6A4F"></i>done</span>
    <span><i class="dot" style="background:#D64045"></i>failed</span>
  </span>
</header>
<div id="net"></div>
<script>
const COLOR={blocked:'#9aa0a6',ready:'#E9B44C',running:'#457B9D',verifying:'#7B2D8E',done:'#2D6A4F',failed:'#D64045'};
const nodes=new vis.DataSet(), edges=new vis.DataSet();
const net=new vis.Network(document.getElementById('net'),{nodes,edges},{
  layout:{hierarchical:{direction:'LR',sortMethod:'directed',levelSeparation:200,nodeSpacing:90}},
  physics:false,
  nodes:{shape:'box',widthConstraint:{maximum:170},margin:10,font:{color:'#fff',size:13,face:'Inter'},borderWidth:0,shapeProperties:{borderRadius:8}},
  edges:{arrows:'to',color:{color:'#33415c',highlight:'#6b86b8'},smooth:{type:'cubicBezier',roundness:.5}},
  interaction:{hover:true}
});
let known=new Set();
async function tick(){
  try{
    const r=await fetch('/api/board'); const d=await r.json();
    if(!d.project){document.getElementById('brief').textContent='(no project yet)';return;}
    document.getElementById('brief').textContent=d.project.brief;
    const counts={}; d.tasks.forEach(t=>counts[t.status]=(counts[t.status]||0)+1);
    document.getElementById('stat').textContent=(counts.done||0)+' / '+d.tasks.length+' done'+(counts.failed?(' · '+counts.failed+' failed'):'');
    d.tasks.forEach(t=>{
      const node={id:t.seq,label:'#'+t.seq+'  '+t.department+'\\n'+t.title,color:{background:COLOR[t.status]||'#555',border:'#0b132b'}};
      if(known.has(t.seq)) nodes.update(node); else {nodes.add(node);known.add(t.seq);}
    });
    d.edges.forEach(e=>{const id='e'+e.from+'_'+e.to; if(!edges.get(id)) edges.add({id,from:e.from,to:e.to});});
  }catch(e){}
}
tick(); setInterval(tick,1000);
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
    if (url.pathname === '/api/board') {
      const data = await boardJSON(url.searchParams.get('id') || undefined);
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML(req.headers.host || 'localhost'));
  } catch (e: any) {
    res.writeHead(500); res.end('err: ' + (e?.message ?? e));
  }
});
server.listen(PORT, '0.0.0.0', () => console.log('live board on http://0.0.0.0:' + PORT));
