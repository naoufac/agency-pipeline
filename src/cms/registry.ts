// CMS REGISTRY — ONE CMS: Directus. Proven end-to-end (`npm run prove:directus` + the servedFromCms
// gate on every build). The former 5-CMS registry (payload/drupal/sanity/craft stubs with fallback
// routing) is retired: one pipeline, one CMS, every project — see GOAL.md. Adding a CMS back is a
// deliberate code change here (and in types.ts CmsName), never a runtime selection.
import type { CmsTarget, CmsName } from './types.ts';
import { directus } from './directus.ts';

export type CmsStatus = 'proven';
export interface CmsEntry { adapter: CmsTarget; status: CmsStatus; note: string; }

export const REGISTRY: Record<CmsName, CmsEntry> = {
  directus: { adapter: directus, status: 'proven',
    note: 'Shared container on ap-pg; built + served-from-CMS proven by `npm run prove:directus`.' },
};

export const CMS_ORDER: CmsName[] = ['directus'];

// The adapter to BUILD with. With one proven CMS there is nothing to fall back from; the shape is
// kept so finalize.ts stays untouched and honest logging still works if a legacy params.cms differs.
export function resolveBuildable(chosen: CmsName): { name: CmsName; entry: CmsEntry; fellBackFrom: CmsName | null } {
  const e = REGISTRY[chosen];
  if (e) return { name: chosen, entry: e, fellBackFrom: null };
  return { name: 'directus', entry: REGISTRY.directus, fellBackFrom: chosen };
}
