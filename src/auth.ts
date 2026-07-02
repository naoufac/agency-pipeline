// auth.ts — M4: sign in and own your sites. Passwordless magic-link auth on Relay's OWN Postgres
// (users + auth_tokens in the public schema, owner_id on projects) and the existing naples.agency
// SMTP. Principles carried over: deterministic (tokens are 256-bit random, single-use, expiring),
// zero-trust (ownership is enforced in SQL on every query, not in the UI), no new services.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { sendMail } from './mail.ts';

export type User = { id: string; email: string };

const MAGIC_TTL_MIN = 15;
const SESSION_TTL_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function ensureAuthTables(pool: pg.Pool): Promise<void> {
  await pool.query(`create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    created_at timestamptz not null default now())`);
  await pool.query(`create table if not exists auth_tokens (
    token text primary key,
    user_id uuid not null references users(id) on delete cascade,
    kind text not null,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now())`);
  await pool.query('alter table projects add column if not exists owner_id uuid');
  await pool.query('create index if not exists projects_owner_idx on projects(owner_id)');
}

const newToken = () => randomBytes(32).toString('hex');

// Step 1: email in → user (created on first sign-in) → single-use magic link, mailed. The link is
// never returned to the caller (only mailed), so possessing the API is not possessing the account.
export async function requestMagic(pool: pg.Pool, email: string, baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) return { ok: false, error: 'a real email address is required' };
  const u = (await pool.query(
    'insert into users(email) values($1) on conflict(email) do update set email=excluded.email returning id', [e])).rows[0];
  const token = newToken();
  await pool.query("insert into auth_tokens(token, user_id, kind, expires_at) values($1,$2,'magic', now() + interval '15 minutes')", [token, u.id]);
  const link = `${baseUrl}/api/auth/verify?token=${token}`;
  const sent = await sendMail(pool, null, e, 'Sign in to Relay',
    `Tap to sign in to your Relay board:\n\n${link}\n\nThe link works once and expires in ${MAGIC_TTL_MIN} minutes. If you didn't request it, ignore this email.`);
  if (!sent.ok) return { ok: false, error: 'could not send the sign-in email — try again shortly' };
  return { ok: true };
}

// Step 2: magic token → session token (cookie). Single-use + expiry enforced in one UPDATE.
export async function verifyMagic(pool: pg.Pool, token: string): Promise<{ session: string; user: User } | null> {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const r = (await pool.query(
    `update auth_tokens set used_at=now() where token=$1 and kind='magic' and used_at is null and expires_at > now() returning user_id`, [token])).rows[0];
  if (!r) return null;
  const u = (await pool.query('select id, email from users where id=$1', [r.user_id])).rows[0];
  if (!u) return null;
  const session = newToken();
  await pool.query("insert into auth_tokens(token, user_id, kind, expires_at) values($1,$2,'session', now() + interval '30 days')", [session, u.id]);
  return { session, user: { id: u.id, email: u.email } };
}

export async function userFromCookie(pool: pg.Pool, cookieHeader: string | undefined): Promise<User | null> {
  const m = String(cookieHeader || '').match(/(?:^|;\s*)relay_session=([0-9a-f]{64})/);
  if (!m) return null;
  const r = (await pool.query(
    `select u.id, u.email from auth_tokens t join users u on u.id=t.user_id
     where t.token=$1 and t.kind='session' and t.used_at is null and t.expires_at > now()`, [m[1]])).rows[0];
  return r ? { id: r.id, email: r.email } : null;
}

export async function logout(pool: pg.Pool, cookieHeader: string | undefined): Promise<void> {
  const m = String(cookieHeader || '').match(/(?:^|;\s*)relay_session=([0-9a-f]{64})/);
  if (m) await pool.query("update auth_tokens set used_at=now() where token=$1 and kind='session'", [m[1]]);
}

export const sessionCookie = (session: string) =>
  `relay_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_DAYS * 86400}`;
export const clearCookie = () => 'relay_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

// THE ownership rule, one place: a legacy/ownerless project is public; an owned project is its
// owner's only. Used by every per-project endpoint.
export const canSee = (user: User | null, ownerId: string | null | undefined): boolean =>
  ownerId == null || (!!user && user.id === ownerId);
