/** Render the CDS review console to a static HTML file for visual preview. */
import * as fs from 'fs';
import * as path from 'path';
import { evaluateForReview } from '../src/cds/review/review-service';
import { renderReviewPage } from '../src/cds/review/page';
import { DEMO_REQUEST } from '../src/cds/review/demo-fixture';

async function main(): Promise<void> {
  const ev = await evaluateForReview(DEMO_REQUEST);
  const html = renderReviewPage(ev.items, 'dr-ng');
  const out = path.resolve(__dirname, '..', 'cds-console-preview.html');
  fs.writeFileSync(out, html, 'utf8');
  console.log(`Wrote ${out} (${html.length} bytes), cards=${ev.items.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
