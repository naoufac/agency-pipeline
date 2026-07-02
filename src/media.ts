// Real media: fill <img data-q="search terms"> placeholders the build agent emits with real
// licensed Pexels photos, downloaded into the site's assets/ dir and referenced LOCALLY — so they
// render in the file:// screenshot AND pass the gate's "no external asset" check. Existing photos
// only; never AI generation. No PEXELS_API_KEY -> no-op (img tags dropped, text-only site).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEY = process.env.PEXELS_API_KEY;
const MAX_PER_PAGE = 8;

export function mediaReady(): boolean { return !!KEY; }

async function pexels(query: string, portrait: boolean): Promise<string | null> {
  if (!KEY) return null;
  const orientation = portrait ? 'portrait' : 'landscape';
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=${orientation}`,
      { headers: { Authorization: KEY } });
    if (!r.ok) return null;
    const d: any = await r.json();
    const ph = d.photos?.[0];
    return ph?.src?.[portrait ? 'large' : 'landscape'] || ph?.src?.large || ph?.src?.original || null;
  } catch { return null; }
}

// Fetch ONE real photo's bytes for a query (licensed Pexels, existing photos only). Shared by the
// static media pass and the DB-row enrichment (rowmedia.ts). Returns null on any miss.
export async function pexelsPhoto(query: string, portrait: boolean): Promise<Buffer | null> {
  const url = await pexels(query, portrait);
  if (!url) return null;
  try {
    const resp = await fetch(url); if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.length >= 1000 ? buf : null;
  } catch { return null; }
}

// Swap every <img ... data-q="QUERY" ...> for a real local photo. Returns rewritten html.
export async function processMedia(html: string, dirUrl: URL): Promise<string> {
  if (!KEY) return html.replace(/<img\b[^>]*\bdata-q\b[^>]*>/gi, '');  // no key -> drop placeholders
  const re = /<img\b[^>]*\bdata-q\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const tags = [...html.matchAll(re)];
  if (!tags.length) return html;
  const queries = [...new Set(tags.map(m => m[1].trim().toLowerCase()))].slice(0, MAX_PER_PAGE);
  const assets = new URL('assets/', dirUrl);
  mkdirSync(fileURLToPath(assets), { recursive: true });
  const map = new Map<string, string>();
  let n = 0;
  for (const q of queries) {
    const portrait = /portrait|avatar|headshot|profile|person|founder|team member/.test(q);
    const url = await pexels(q, portrait);
    if (!url) continue;
    try {
      const resp = await fetch(url); if (!resp.ok) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 1000) continue;
      const name = `media-${++n}.jpg`;
      writeFileSync(fileURLToPath(new URL(name, assets)), buf);
      map.set(q, 'assets/' + name);
    } catch { /* skip this image */ }
  }
  return html.replace(re, (tag, q) => {
    const local = map.get(String(q).trim().toLowerCase());
    if (!local) return '';                                            // never ship a broken <img>
    let t = tag.replace(/\s*\bdata-q\s*=\s*["'][^"']*["']/i, '');
    t = /\bsrc\s*=\s*["'][^"']*["']/i.test(t)
      ? t.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${local}"`)
      : t.replace(/<img\b/i, `<img src="${local}"`);
    if (!/\bloading\s*=/.test(t)) t = t.replace(/<img\b/i, '<img loading="lazy"');
    if (!/\bclass\s*=/.test(t)) t = t.replace(/<img\b/i, '<img class="w-full h-full object-cover"');
    return t;
  });
}
