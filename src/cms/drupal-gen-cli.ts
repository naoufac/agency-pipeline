// CLI: Relay generates a REAL Drupal CMS site from a brief.
// Usage: npm run cms:drupal-gen "<brief>"
import { generateDrupalSite } from './drupal.ts';

const brief = process.argv.slice(2).join(' ').trim();
if (!brief) { console.error('usage: npm run cms:drupal-gen "<brief>"'); process.exit(2); }

console.log(`\nRelay → Drupal: generating a real CMS site for:\n  "${brief}"\n`);
generateDrupalSite(brief)
  .then((s) => {
    console.log('✅ REAL Drupal site generated:\n');
    console.log('  site:   ' + s.siteName);
    for (const p of s.pages) console.log('   - ' + p.title.padEnd(10) + ' ' + p.url);
    console.log('\n  HOME:   ' + s.homeUrl);
    console.log('  ADMIN:  ' + s.adminUrl + '  (edit it in Drupal, like WordPress)\n');
    process.exit(0);
  })
  .catch((e) => { console.error('FAILED:', e?.message ?? e); process.exit(1); });
