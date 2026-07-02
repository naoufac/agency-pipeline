// LANDING SHAPE (PLAN.md M1) — is this brief asking for ONE focused conversion page, or a
// multi-page site? Deterministic + brief-rooted + closed set, exactly like archetype.ts/themes.ts:
// the LLM may at most NAME the shape (validated); this classifier is the floor. A landing project
// ships exactly ONE page in conversion order (hero pain/promise → proof → offer → objections →
// final CTA), enforced by the site_model gate in verify.ts — never by an agent's word.
export type Shape = 'landing' | 'multi';
export const SHAPES: Shape[] = ['landing', 'multi'];
export const DEFAULT_SHAPE: Shape = 'multi';

const LANDING_RE = /\b(landing[- ]?page|sales[- ]?page|squeeze[- ]?page|one[- ]?pager|(one|single)[- ]?page (site|website|sales)|lead[- ]?(gen(eration)?|capture|magnet)|opt[- ]?in page|sign[- ]?up page|waitlist|pre[- ]?launch|launch page|coming[- ]?soon|promo(tion)? page|high[- ]?convert(ing)?|conversion[- ]?(page|focused|optimi[sz]ed))\b/;

export function isShape(x: any): x is Shape { return typeof x === 'string' && (SHAPES as string[]).includes(x); }

export function classifyShape(brief: string): Shape {
  return LANDING_RE.test(' ' + String(brief || '').toLowerCase() + ' ') ? 'landing' : DEFAULT_SHAPE;
}

// Trust an LLM-named shape only if it's in the closed set; else classify the brief deterministically.
export function shapeFor(named: any, brief: string): Shape { return isShape(named) ? named : classifyShape(brief); }

// The section types the landing gate counts as PROOF/OFFER — site_model requires >= 2 of these on
// a landing page (and the page must end in cta/form). Mirror of the conversion set in the compose
// role prompt; keep in sync.
export const CONVERSION_SECTIONS = new Set(['testimonials', 'stats', 'logos', 'offer', 'pricing', 'faq']);
