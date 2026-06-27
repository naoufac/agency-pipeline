// A working agent is JUST AN API CALL: context in -> text/artifact out.
// Live provider: MiniMax (OpenAI-compatible /chat/completions). If MINIMAX_API_KEY is
// unset, falls back to deterministic STUBS so the engine still runs end-to-end offline.
//   MINIMAX_API_KEY   – required for live calls
//   MINIMAX_BASE_URL  – default https://api.minimax.io/v1   (or https://api.minimaxi.com/v1)
//   MINIMAX_MODEL     – default MiniMax-M2  (set to whatever your key supports, e.g. MiniMax-Text-01)

const KEY = process.env.MINIMAX_API_KEY;
const BASE = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2';

export type Ctx = { brief: string; upstream: { seq: number; department: string; content: string }[] };

// One-line role per department — the only thing that differs between agents.
const ROLE: Record<string, string> = {
  research:    'You are the Research department of an automated creative agency. From the brief, output concise market & positioning research. Plain text.',
  branding:    'You are the Branding department. Output brand tokens — palette as hex codes, typography, radius — plus a one-line guide. You MUST include hex colours like #0B6E4F.',
  stack:       'You are the Stack department. Decide the tech stack and state it in one short paragraph.',
  database:    'You are the Database department. Output ONLY a runnable PostgreSQL CREATE TABLE block for this app — no prose, no markdown fences.',
  design:      'You are the Design-system department. Using the brand tokens above, list the components and how the tokens map.',
  media:       'You are the Media department. Describe the image/asset set to source for this app.',
  content:     'You are the Copywriting department. Produce the key microcopy in the brand tone.',
  auth:        'You are the Auth department. Specify the accounts/authentication model.',
  frontend:    'You are the Frontend department. List the screens and their components, applying the brand. Use the word "screen".',
  integration: 'You are the Integration department. List the integrations to wire (payments, maps, etc.) and the deploy steps.',
  qa:          'You are QA. Review the assembled upstream outputs. If they are coherent and complete, end your reply with the single word PASS; otherwise end with FAIL and why.',
};

function buildUser(ctx: Ctx): string {
  let s = `BRIEF: ${ctx.brief}\n`;
  if (ctx.upstream.length) {
    s += `\nUPSTREAM RESULTS (the departments you depend on):\n`;
    for (const u of ctx.upstream) s += `\n[#${u.seq} ${u.department}]\n${u.content}\n`;
  }
  return s;
}

async function callMiniMax(system: string, user: string): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`MiniMax ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) throw new Error('MiniMax: empty response ' + JSON.stringify(data).slice(0, 200));
  return String(text);
}

export async function runAgent(department: string, ctx: Ctx): Promise<string> {
  if (KEY) {
    const system = ROLE[department] || `You are the ${department} department of an automated agency. Do your part for the brief.`;
    return await callMiniMax(system, buildUser(ctx));
  }
  return stub(department, ctx.brief);
}

// ---- offline deterministic fallback (no key) ----
const DB_SQL = `create table users (
  id serial primary key,
  phone text unique not null,
  password_hash text not null
);
create table items (
  id serial primary key,
  name text not null,
  price numeric not null
);
create table orders (
  id serial primary key,
  user_id int references users(id),
  total numeric not null,
  status text not null default 'placed'
);`;

function stub(department: string, brief: string): string {
  switch (department) {
    case 'research':    return `Research for: ${brief}\nPremium urban market; cash-on-delivery common; FR/AR conventions.`;
    case 'branding':    return `Brand tokens\nprimary=#0B6E4F  secondary=#E9C46A\ntypography=Inter  radius=12px`;
    case 'stack':       return `Stack decision: Supabase (Postgres) backend + Next.js PWA.`;
    case 'database':    return DB_SQL;
    case 'design':      return `Design system: brand tokens applied; 12 base components.`;
    case 'media':       return `Media: 20 product images sourced + brand assets.`;
    case 'content':     return `Copy: premium, locally-proud microcopy set.`;
    case 'auth':        return `Auth: phone + password, OTP, sessions.`;
    case 'frontend':    return `Screens built: browse, cart, checkout, track. (applies brand tokens)`;
    case 'integration': return `Integration: payments + maps wired; deploy config ready.`;
    case 'qa':          return `QA harness ran build + smoke tests. Verdict: PASS.`;
    default:            return `[${department}] completed for: ${brief}`;
  }
}
