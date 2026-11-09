import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const pages = [
  'about.html','contact.html','deposit-confirmation.html','education.html',
  'heatmap.html','index.html','join.html','member-portal.html','membership.html',
  'privacy.html','rebate.html','rewards.html','system.html','terms.html'
];
const errors = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const check = (condition, message) => { if (!condition) errors.push(message); };

let manifest;
try { manifest = JSON.parse(read('manifest.webmanifest')); }
catch (error) { errors.push('manifest.webmanifest is invalid JSON: ' + error.message); }

if (manifest) {
  check(manifest.name === 'Market Psychology Society', 'Manifest name is unexpected');
  check(manifest.display === 'standalone', 'Manifest display must be standalone');
  check(manifest.scope === './', 'Manifest scope must remain repository-root relative');
  check(manifest.start_url === './index.html?source=pwa', 'Manifest start_url changed unexpectedly');
  check(Array.isArray(manifest.icons) && manifest.icons.some(icon => icon.src === './assets/mps-app-icon-512.png' && icon.sizes === '512x512'), '512px PNG app icon is missing from manifest');
  for (const icon of manifest.icons || []) check(exists(icon.src.replace(/^\.\//, '')), 'Manifest icon file missing: ' + icon.src);
}

for (const page of pages) {
  if (!exists(page)) { errors.push('Missing page: ' + page); continue; }
  const html = read(page);
  check(!html.includes("\\\\n"), page + ': iOS install instructions contain a double-escaped newline');
  check((html.match(/rel=["']manifest["']/gi) || []).length === 1, page + ': expected exactly one manifest link');
  check((html.match(/id=["']installMpsApp["']/gi) || []).length === 1, page + ': expected exactly one install button');
  check((html.match(/serviceWorker\.register\(/g) || []).length === 1, page + ': expected exactly one service worker registration');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  check(duplicateIds.length === 0, page + ': duplicate IDs: ' + [...new Set(duplicateIds)].join(', '));

  const blankLinks = [...html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)];
  for (const link of blankLinks) check(/rel=["'][^"']*noreferrer[^"']*["']/i.test(link[0]), page + ': target=_blank link missing noreferrer');

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(code => code.trim());
  scripts.forEach((code, index) => {
    try { new vm.Script(code, { filename: page + ':inline-script-' + (index + 1) }); }
    catch (error) { errors.push(page + ': inline script ' + (index + 1) + ' syntax error: ' + error.message); }
  });

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (!value || /^(?:https?:|mailto:|tel:|javascript:|data:|#|\/\/)/i.test(value)) continue;
    const clean = value.split(/[?#]/)[0].replace(/^\.\//, '');
    if (!clean) continue;
    check(exists(clean), page + ': local asset/reference missing: ' + value);
  }
}

for (const page of ['join.html', 'deposit-confirmation.html']) {
  const html = read(page);
  check(!/<form\b/i.test(html), page + ': legacy HTML form must not return');
  check(!/js\/(?:join|deposit)\.js/i.test(html), page + ': legacy form script must not return');
}

const sw = read('sw.js');
try { new vm.Script(sw, { filename: 'sw.js' }); }
catch (error) { errors.push('sw.js syntax error: ' + error.message); }
check(sw.includes(String.raw`const isCode=/\.(?:css|js)$/i.test(url.pathname);`), 'sw.js must detect CSS/JS files for network-first updates');
check(/if\(isCode\)[\s\S]*?await fetch\(request\)[\s\S]*?cache\.put\(request,response\.clone\(\)\)/.test(sw), 'sw.js CSS/JS network-first cache update missing');
check(/request\.method!=='GET'/.test(sw), 'sw.js must bypass non-GET requests');
check(/url\.origin!==self\.location\.origin/.test(sw), 'sw.js must bypass cross-origin requests');
check(/request\.mode==='navigate'[\s\S]*?fetch\(request\)\.catch/.test(sw), 'sw.js navigation must not use cache-first');
check(/url\.searchParams\.has\('session'\)/.test(sw) && /url\.searchParams\.has\('token'\)/.test(sw), 'sw.js must bypass session/token query URLs');
check(/const isStatic=/.test(sw) && /if\(!isStatic\)return/.test(sw), 'sw.js must cache only static assets');
check(/keys\.filter\(key=>key\.startsWith\(CACHE_PREFIX\)&&key!==CACHE_NAME\)/.test(sw), 'sw.js must clean up only old MPS cache namespaces');

if (errors.length) {
  console.error('MPS PWA validation FAILED');
  for (const error of errors) console.error(' - ' + error);
  process.exit(1);
}
console.log('MPS PWA validation PASSED');
console.log('Checked ' + pages.length + ' public pages, manifest/icons, inline JavaScript, links, Join/Deposit regressions, and service-worker privacy/update rules.');
