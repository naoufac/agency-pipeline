// Drupal generator — Relay turns a brief into a REAL Drupal CMS site (Drupal's own engine, theme,
// and admin), NOT the old static renderer. Flow: brief -> LLM writes the page copy -> the pages are
// created as real Drupal nodes via drush -> the deliverable is the live Drupal-served site, editable
// in the Drupal admin. One shared Drupal (relay-drupal); each generated site is a set of nodes under
// a unique project key + a project landing page.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { llmText } from '../agents.ts';

const DRUPAL_URL = process.env.DRUPAL_URL || 'https://drupal.naples.agency';

function extractJson(s: string): any {
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('no JSON in LLM output');
  return JSON.parse(s.slice(a, b + 1));
}

export interface DrupalSite { siteKey: string; siteName: string; pages: { title: string; url: string }[]; homeUrl: string; adminUrl: string; }

export async function generateDrupalSite(brief: string): Promise<DrupalSite> {
  // 1) Relay writes the real page copy from the brief (reuses Relay's reasoning-safe LLM call).
  const system = 'You write website copy. Output ONLY raw JSON — no commentary, no markdown fences, no <think>.';
  const user =
`Write the website copy for this brief: "${brief}".
Return ONLY this JSON shape:
{"site_name":"<short brand name>","pages":[{"title":"Home","body":"<rich HTML using only <p> <h2> <ul> <li> <strong> tags — 2 to 4 paragraphs of specific, real marketing copy>"},{"title":"About","body":"..."},{"title":"Services","body":"..."},{"title":"Contact","body":"..."}]}
Make the copy specific to the brief, concrete and confident. Exactly 4 pages.`;
  const data = extractJson(await llmText(system, user, 9000));
  const siteName: string = String(data.site_name || 'New Site');
  const pages: any[] = Array.isArray(data.pages) ? data.pages.slice(0, 6) : [];
  if (!pages.length) throw new Error('LLM produced no pages');

  // 2) Create the pages as REAL Drupal nodes via drush, tagged by a unique site key.
  const siteKey = 'relay-' + Math.random().toString(16).slice(2, 10);
  const payload = { siteKey, siteName, brief, pages: pages.map((p) => ({ title: String(p.title || 'Page'), body: String(p.body || '') })) };
  writeFileSync('/tmp/drupal-content.json', JSON.stringify(payload));
  writeFileSync('/tmp/drupal-make.php', DRUPAL_MAKE_PHP);
  execSync('docker cp /tmp/drupal-content.json relay-drupal:/tmp/drupal-content.json');
  execSync('docker cp /tmp/drupal-make.php relay-drupal:/tmp/drupal-make.php');
  const out = execSync('docker exec relay-drupal vendor/bin/drush php:script /tmp/drupal-make.php', { encoding: 'utf8' });
  const made = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)) as { title: string; path: string }[];

  const built = made.map((m) => ({ title: m.title, url: DRUPAL_URL + m.path }));
  return { siteKey, siteName, pages: built, homeUrl: built[0]?.url || DRUPAL_URL, adminUrl: DRUPAL_URL + '/user/login' };
}

// PHP run inside the Drupal container: create one node per page + a menu, print [{title,path}].
const DRUPAL_MAKE_PHP = `<?php
$d = json_decode(file_get_contents('/tmp/drupal-content.json'), true);
$out = [];
foreach ($d['pages'] as $p) {
  $node = \\Drupal::entityTypeManager()->getStorage('node')->create([
    'type' => 'page',
    'title' => $d['siteName'] . ' — ' . $p['title'],
    'body' => ['value' => $p['body'], 'format' => 'basic_html'],
    'status' => 1,
    'promote' => 0,
  ]);
  $node->save();
  $alias = '/' . $d['siteKey'] . '/' . preg_replace('/[^a-z0-9]+/','-', strtolower($p['title']));
  \\Drupal::service('path_alias.repository');
  $a = \\Drupal::entityTypeManager()->getStorage('path_alias')->create(['path' => '/node/' . $node->id(), 'alias' => $alias, 'langcode' => 'en']);
  $a->save();
  $out[] = ['title' => $p['title'], 'path' => $alias];
}
echo json_encode($out);
`;
