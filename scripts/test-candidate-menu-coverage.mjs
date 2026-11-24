import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('candidates/Index.html', 'utf8');
const expected = ['home','register','deposit','dashboard','learning','pulse','calculator','vip','warning','news','advertise','admin'];
const navPages = [...html.matchAll(/<button\\b[^>]*data-page="([^"]+)"/g)].map(m => m[1]);
const sectionPages = [...html.matchAll(/<section\\b[^>]*id="page-([^"]+)"/g)].map(m => m[1]);

for (const page of expected) {
  assert.ok(navPages.includes(page), 'Menu navigation missing: ' + page);
  assert.ok(sectionPages.includes(page), 'Page section missing: ' + page);
}
assert.equal(new Set(navPages).size, navPages.length, 'Duplicate menu navigation IDs');
assert.equal(new Set(sectionPages).size, sectionPages.length, 'Duplicate page section IDs');
assert.ok(html.includes('Peringatan &amp; SOP Trading'), 'Trading warning/SOP title missing');
assert.ok(html.includes('PERINGATAN RISIKO'), 'Trading risk warning missing');
assert.ok(html.includes('MPS Regular Member'), 'Regular membership details missing');
assert.ok(html.includes('MPS Active IB Member'), 'Active IB membership details missing');
assert.ok(html.includes('Rp100.000 / bulan'), 'Regular monthly fee missing');
assert.ok(html.includes('Rp500.000'), 'Minimum Exness deposit detail missing');
assert.ok(html.includes('https://one.toexness.com/a/bdthbxwb2q?platform=mobile'), 'Official MPS IB referral missing');
console.log('PASS: all ' + expected.length + ' MPS menu routes and required warning/membership content are present.');
