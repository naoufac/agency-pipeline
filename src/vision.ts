// Visual QA — a vision model "reads" a page screenshot and returns concrete design feedback.
// Provider: Gemini (multimodal). No GEMINI_API_KEY -> disabled (the pipeline still runs).
import { readFileSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export function visionReady(): boolean { return !!KEY; }

function firstJson(s: string): any {
  const a = s.indexOf('{'); if (a < 0) return null;
  let d = 0;
  for (let i = a; i < s.length; i++) {
    if (s[i] === '{') d++;
    else if (s[i] === '}') { if (--d === 0) { try { return JSON.parse(s.slice(a, i + 1)); } catch { return null; } } }
  }
  return null;
}

export interface Critique { score: number; issues: string[]; }

// Read a screenshot and return {score 1-10, issues[]}. Throws on API error (caller tolerates).
export async function critique(pngPath: string, label: string): Promise<Critique> {
  if (!KEY) return { score: 0, issues: ['vision disabled (set GEMINI_API_KEY)'] };
  const img = readFileSync(pngPath).toString('base64');
  const prompt =
    `You are a meticulous senior product designer reviewing a ${label} screenshot of a website page. ` +
    `Identify ONLY real, clearly-visible problems that would make a paying client unhappy: navigation that ` +
    `overflows / cuts off / isn't mobile-usable (e.g. no hamburger), overlapping or clipped elements, truncated ` +
    `text, low contrast / unreadable text, broken or empty sections, cramped or inconsistent spacing, weak ` +
    `hierarchy, low polish. Ignore anything that looks fine — do NOT invent problems. Max 5 issues, terse and ` +
    `specific. Then a 1-10 overall quality score (10 = ready to ship to a paying client). ` +
    `Output ONLY compact JSON: {"score": <int>, "issues": ["...", "..."]}.`;
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: img } }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data: any = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const j = firstJson(txt) || {};
  const score = Math.max(0, Math.min(10, Math.round(Number(j.score) || 0)));
  const issues = Array.isArray(j.issues) ? j.issues.slice(0, 6).map((x: any) => String(x)) : [];
  return { score, issues };
}
