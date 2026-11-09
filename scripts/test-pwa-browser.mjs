import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root = process.cwd();
const mime = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.webmanifest':'application/manifest+json',
  '.woff':'font/woff',
  '.woff2':'font/woff2'
};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(root, '.' + pathname);
  if (!target.startsWith(root + path.sep) && target !== root) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

const pages = [
  'index.html','about.html','contact.html','education.html','heatmap.html',
  'join.html','deposit-confirmation.html','member-portal.html','membership.html',
  'privacy.html','rebate.html','rewards.html','system.html','terms.html'
];
const failures = [];
let browser;
let base;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = 'http://127.0.0.1:' + address.port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const first = await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  if (!first || first.status() !== 200) failures.push('Homepage did not return HTTP 200');
  await page.evaluate(() => navigator.serviceWorker.ready.then(registration => registration.scope));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 })
    .catch(() => failures.push('Service worker did not take control after reload'));

  const manifestResponse = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return { ok: false, reason: 'manifest link missing' };
    const response = await fetch(link.href);
    return { ok: response.ok, type: response.headers.get('content-type') };
  });
  if (!manifestResponse.ok) failures.push('Manifest could not be fetched by browser');

  for (const route of pages) {
    const response = await page.goto(base + '/' + route, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() !== 200) failures.push(route + ' did not return HTTP 200');
    const controls = await page.evaluate(() => ({
      installButton: !!document.getElementById('installMpsApp'),
      manifest: !!document.querySelector('link[rel="manifest"]'),
      controller: !!navigator.serviceWorker.controller
    }));
    if (!controls.installButton) failures.push(route + ': install button missing in DOM');
    if (!controls.manifest) failures.push(route + ': manifest link missing in DOM');
    if (!controls.controller) failures.push(route + ': page not controlled by service worker');
  }

  const cssOnline = await page.evaluate(async () => {
    const response = await fetch('/css/style.css?browser-test=1');
    return response.status;
  });
  if (cssOnline !== 200) failures.push('CSS network-first request failed online');
  const cachedCss = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v3');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('/css/style.css?browser-test=1'));
  });
  if (!cachedCss) failures.push('CSS was not cached after successful network-first request');


  const jsOnline = await page.evaluate(async () => (await fetch('/js/main.js?browser-test=1')).status);
  if (jsOnline !== 200) failures.push('JavaScript network-first request failed online');
  const cachedJs = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v3');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('/js/main.js?browser-test=1'));
  });
  if (!cachedJs) failures.push('JavaScript was not cached after successful network-first request');

  const tokenRequestStatus = await page.evaluate(async () => {
    const response = await fetch('/assets/mps-app-icon.svg?session=browser-test-secret');
    return response.status;
  });
  if (tokenRequestStatus !== 200) failures.push('Session-query static asset test request failed');
  const tokenWasCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v3');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('session=browser-test-secret'));
  });
  if (tokenWasCached) failures.push('Session-query URL was incorrectly cached');



  const svgIcon = await page.evaluate(async () => {
    const response = await fetch('/assets/mps-app-icon.svg');
    const bitmap = await createImageBitmap(await response.blob());
    return { ok: response.ok, width: bitmap.width, height: bitmap.height };
  });
  if (!svgIcon.ok || svgIcon.width !== 512 || svgIcon.height !== 512) failures.push('SVG app icon failed browser decoding or dimensions check');

  const pngIcon = await page.evaluate(async () => {
    const response = await fetch('/assets/mps-app-icon-512.png');
    const bitmap = await createImageBitmap(await response.blob());
    return { ok: response.ok, width: bitmap.width, height: bitmap.height };
  });
  if (!pngIcon.ok || pngIcon.width !== 512 || pngIcon.height !== 512) failures.push('512px PNG app icon failed browser decoding or dimensions check');


  const apiStatus = await page.evaluate(async () => (await fetch('/api/member?token=browser-test-secret')).status);
  const apiWasCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v3');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('/api/member') || request.url.includes('token=browser-test-secret'));
  });
  if (apiWasCached) failures.push('API/member URL was incorrectly cached');
  const htmlPagesCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v3');
    const keys = await cache.keys();
    return keys.some(request => {
      const pathname = new URL(request.url).pathname;
      return pathname.endsWith('.html') && !pathname.endsWith('/offline.html');
    });
  });
  if (htmlPagesCached) failures.push('A website HTML/member page was cached; only offline.html may be cached');

  await context.setOffline(true);
  const cssOffline = await page.evaluate(async () => {
    try {
      const response = await fetch('/css/style.css?browser-test=1');
      return response.status;
    } catch { return 0; }
  });
  if (cssOffline !== 200) failures.push('Cached CSS did not load while offline');


  const jsOffline = await page.evaluate(async () => {
    try { return (await fetch('/js/main.js?browser-test=1')).status; }
    catch { return 0; }
  });
  if (jsOffline !== 200) failures.push('Cached JavaScript did not load while offline');

  let offlineBody = '';
  try {
    await page.goto(base + '/education.html', { waitUntil: 'domcontentloaded', timeout: 10000 });
    offlineBody = await page.locator('body').innerText();
  } catch (error) {
    failures.push('Offline navigation threw: ' + error.message);
  }
  if (!offlineBody.includes('MPS sedang offline')) failures.push('Offline navigation did not show the privacy-safe offline page');

  await context.setOffline(false);

  const mobileContext = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2
  });
  await mobileContext.route('https://**/*', route => route.abort());
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on('pageerror', error => mobileErrors.push(error.message));
  await mobilePage.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  await mobilePage.locator('#navToggle').click();
  const mobileMenu = await mobilePage.evaluate(() => ({
    open: document.getElementById('navLinks')?.classList.contains('open'),
    expanded: document.getElementById('navToggle')?.getAttribute('aria-expanded'),
    installButton: !!document.getElementById('installMpsApp'),
    menuRight: document.getElementById('navLinks')?.getBoundingClientRect().right,
    viewportWidth: window.innerWidth
  }));
  if (!mobileMenu.open || mobileMenu.expanded !== 'true') failures.push('Mobile navigation menu did not open accessibly');
  if (!mobileMenu.installButton) failures.push('PWA install control missing in mobile navigation');
  if (mobileMenu.menuRight > mobileMenu.viewportWidth) failures.push('Mobile navigation extends beyond viewport');
  if (mobileErrors.length) failures.push('Mobile browser page errors: ' + mobileErrors.join(' | '));
  await mobileContext.close();

  if (pageErrors.length) failures.push('Browser page errors: ' + pageErrors.join(' | '));
  await context.close();
} catch (error) {
  failures.push('Browser test setup/runtime error: ' + error.stack);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

if (failures.length) {
  console.error('MPS PWA browser test FAILED');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('MPS PWA browser test PASSED');
console.log('Chromium loaded all 14 pages, verified manifest and service-worker control, tested CSS network-first caching, session-query cache bypass, offline CSS fallback, and privacy-safe offline navigation.');
