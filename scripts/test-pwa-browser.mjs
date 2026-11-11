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
      'Cache-Control': /\.(?:css|js)$/.test(target) ? 'public, max-age=300' : 'no-store'
    });
    res.end(data);
  });
});

const pages = [
  'index.html','about.html','announcements.html','contact.html','education.html','heatmap.html',
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
    const response = await fetch('/css/style.css');
    return response.status;
  });
  if (cssOnline !== 200) failures.push('CSS network-first request failed online');
  const versionedCssStatus = await page.evaluate(async () => (await fetch('/css/style.css?v=mps-test-version')).status);
  if (versionedCssStatus !== 200) failures.push('Versioned CSS request failed online');
  const versionedCssCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    return (await cache.keys()).some(request => request.url.includes('/css/style.css?v=mps-test-version'));
  });
  if (!versionedCssCached) failures.push('Realistic versioned CSS URL was not cached');

  const cachedCss = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('/css/style.css'));
  });
  if (!cachedCss) failures.push('CSS was not cached after successful network-first request');


  const jsOnline = await page.evaluate(async () => (await fetch('/js/main.js')).status);
  if (jsOnline !== 200) failures.push('JavaScript network-first request failed online');
  const cachedJs = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('/js/main.js'));
  });
  if (!cachedJs) failures.push('JavaScript was not cached after successful network-first request');
  const arbitraryScriptStatus = await page.evaluate(async () => (await fetch('/admin.js')).status);
  const arbitraryScriptCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    return (await cache.keys()).some(request => new URL(request.url).pathname === '/admin.js');
  });
  if (arbitraryScriptCached) failures.push('Non-allowlisted same-origin JavaScript was cached');

  const parameterizedAssetStatus = await page.evaluate(async () => (await fetch('/assets/mps-app-icon.svg?cache-bust=1')).status);
  const parameterizedAssetCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    return (await cache.keys()).some(request => request.url.includes('cache-bust=1'));
  });
  if (parameterizedAssetStatus !== 200) failures.push('Parameterized asset request failed');
  if (parameterizedAssetCached) failures.push('Parameterized asset URL was cached');


  const tokenRequestStatus = await page.evaluate(async () => {
    const response = await fetch('/assets/mps-app-icon.svg?session=browser-test-secret');
    return response.status;
  });
  if (tokenRequestStatus !== 200) failures.push('Session-query static asset test request failed');
  const otherQueryStatus = await page.evaluate(async () => (await fetch('/assets/mps-app-icon.svg?other=not-allowed')).status);
  if (otherQueryStatus !== 200) failures.push('Other-query asset test request failed');
  const otherQueryCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    return (await cache.keys()).some(request => request.url.includes('other=not-allowed'));
  });
  if (otherQueryCached) failures.push('Non-version query URL was incorrectly cached');

  const tokenWasCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('session=browser-test-secret'));
  });
  if (tokenWasCached) failures.push('Session-query URL was incorrectly cached');



  const svgIcon = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/assets/mps-app-icon.svg';
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  if (svgIcon.width !== 512 || svgIcon.height !== 512) failures.push('SVG app icon failed browser decoding or dimensions check');

  const pngIcon = await page.evaluate(async () => {
    const response = await fetch('/assets/mps-app-icon-512.png');
    const bitmap = await createImageBitmap(await response.blob());
    return { ok: response.ok, width: bitmap.width, height: bitmap.height };
  });
  if (!pngIcon.ok || pngIcon.width !== 512 || pngIcon.height !== 512) failures.push('512px PNG app icon failed browser decoding or dimensions check');


  const apiStatus = await page.evaluate(async () => (await fetch('/api/member?token=browser-test-secret')).status);
  const apiWasCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
    const keys = await cache.keys();
    return keys.some(request => request.url.includes('/api/member') || request.url.includes('token=browser-test-secret'));
  });
  if (apiWasCached) failures.push('API/member URL was incorrectly cached');
  const htmlPagesCached = await page.evaluate(async () => {
    const cache = await caches.open('mps-public-shell-v6');
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
      const response = await fetch('/css/style.css');
      return response.status;
    } catch { return 0; }
  });
  if (cssOffline !== 200) failures.push('Cached CSS did not load while offline');


  const versionedCssOffline = await page.evaluate(async () => {
    try { return (await fetch('/css/style.css?v=mps-test-version')).status; }
    catch { return 0; }
  });
  if (versionedCssOffline !== 200) failures.push('Versioned CSS did not load offline from cache');

  const jsOffline = await page.evaluate(async () => {
    try { return (await fetch('/js/main.js')).status; }
    catch { return 0; }
  });
  if (jsOffline !== 200) failures.push('Cached JavaScript did not load while offline');

  let offlineBody = '';
  try {
    await page.goto(base + '/index.html?source=pwa', { waitUntil: 'domcontentloaded', timeout: 10000 });
    offlineBody = await page.locator('body').innerText();
  } catch (error) {
    failures.push('Offline navigation threw: ' + error.message);
  }
  if (!offlineBody.includes('MPS sedang offline')) failures.push('Offline PWA start_url navigation did not show the privacy-safe offline page');

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

  await mobilePage.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = () => { window.__mpsInstallPromptCalled = true; };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  const androidInstallButton = mobilePage.locator('#installMpsApp');
  if (!await androidInstallButton.isVisible()) failures.push('Android install button did not appear after beforeinstallprompt');
  await androidInstallButton.click();
  await mobilePage.waitForFunction(() => document.getElementById('installMpsApp')?.hidden === true);
  const androidPromptCalled = await mobilePage.evaluate(() => window.__mpsInstallPromptCalled === true);
  if (!androidPromptCalled) failures.push('Android install button did not invoke the native install prompt handler');

  // Exercise the actual mobile navigation on every page that uses the shared
  // hamburger menu. Pages with a deliberately different navigation layout
  // (for example the standalone Market Pulse preview) are checked separately
  // by their page-load and install-control assertions above.
  for (const route of pages) {
    await mobilePage.goto(base + '/' + route, { waitUntil: 'domcontentloaded' });
    const menuStructure = await mobilePage.evaluate(() => ({
      toggle: !!document.getElementById('navToggle'),
      nav: !!document.getElementById('navLinks')
    }));
    if (menuStructure.toggle !== menuStructure.nav) {
      failures.push(route + ': mobile menu toggle/nav structure is incomplete');
      continue;
    }
    if (!menuStructure.toggle) continue;

    await mobilePage.locator('#navToggle').click();
    const menuState = await mobilePage.evaluate(() => {
      const nav = document.getElementById('navLinks');
      const toggle = document.getElementById('navToggle');
      const rect = nav?.getBoundingClientRect();
      return {
        open: !!nav?.classList.contains('open'),
        expanded: toggle?.getAttribute('aria-expanded'),
        left: rect?.left ?? 0,
        right: rect?.right ?? 0,
        viewportWidth: window.innerWidth
      };
    });
    if (!menuState.open || menuState.expanded !== 'true') {
      failures.push(route + ': mobile navigation did not open with aria-expanded=true');
    }
    if (menuState.left < -1 || menuState.right > menuState.viewportWidth + 1) {
      failures.push(route + ': mobile navigation extends beyond the viewport');
    }
  }

  // Exercise the Announcement Center prototype: ticker controls, category filter,
  // and the presentation-only roulette. No real member or draw data is loaded.
  const announcementResponse = await page.goto(base + '/announcements.html', { waitUntil: 'domcontentloaded' });
  if (!announcementResponse || announcementResponse.status() !== 200) failures.push('Announcement Center did not return HTTP 200');
  const announcementTitle = await page.title();
  const publicCenterSafety = await page.evaluate(() => ({
    enabled: window.MPS_CONFIG?.publicCenter?.enabled,
    remoteScripts: [...document.scripts].filter(script => {
      if (!script.src) return false;
      try { return new URL(script.src).hostname === 'script.google.com'; } catch { return false; }
    }).length
  }));
  if (publicCenterSafety.enabled !== false) failures.push('Public Center feature flag must remain disabled in the static prototype');
  if (publicCenterSafety.remoteScripts !== 0) failures.push('Public Center injected a remote Apps Script executable into the page');
  if (!announcementTitle.includes('Announcement Center')) failures.push('Announcement Center title is missing');
  const tickerButton = page.locator('.ticker-toggle');
  await tickerButton.click();
  const tickerPaused = await page.locator('.ticker-track').evaluate(el => el.classList.contains('is-paused'));
  if (!tickerPaused || await tickerButton.getAttribute('aria-pressed') !== 'true') failures.push('Announcement ticker pause control failed');
  await page.locator('[data-filter="community"]').click();
  const visibleCategories = await page.locator('.announce-card:not([hidden])').evaluateAll(nodes => nodes.map(el => el.dataset.category));
  if (visibleCategories.length !== 1 || visibleCategories[0] !== 'community') failures.push('Announcement category filter did not isolate community cards');
  await page.locator('[data-filter="all"]').click();
  await page.locator('#demoSpin').click();
  await page.waitForFunction(() => document.getElementById('rouletteResult')?.textContent.includes('Simulasi selesai'), null, { timeout: 7000 });
  const rouletteText = await page.locator('#rouletteResult').innerText();
  if (!rouletteText.includes('Tidak ada pemenang')) failures.push('Demo roulette implied a winner or failed to disclose simulation-only behavior');

  // Exercise the data-only public-center transport with a mocked CORS endpoint.
  // The response is text that resembles JavaScript assignment syntax, but must only
  // be parsed as JSON; appended executable code must never run in the page origin.
  const feedContext = await browser.newContext({ serviceWorkers: 'block' });
  const testEndpoint = 'https://script.google.com/macros/s/TEST_PUBLIC_CENTER/exec';
  const originalConfig = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  const testConfig = originalConfig
    .replace('enabled: false', 'enabled: true')
    .replace(/endpoint: "https:\/\/script\.google\.com\/macros\/s\/[^"]+\/exec"/, 'endpoint: "' + testEndpoint + '"');
  await feedContext.route('https://**/*', route => route.abort());
  await feedContext.route('**/config.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: testConfig
  }));
  let feedMode = 'valid';
  await feedContext.route('https://script.google.com/macros/s/TEST_PUBLIC_CENTER/exec**', route => {
    const validEnvelope = 'window.MPS_PUBLIC_CENTER_DATA={"ok":true,"announcements":[{"ID":"ANN-TEST","Title":"<img src=x onerror=window.__mpsXssExecuted=true>","Category":"important","Body":"<svg onload=window.__mpsXssExecuted=true>Data-only feed test"}],"activity":[],"tickerSettings":{"enabled":false,"speed":34,"theme":"Neon"}};';
    const body = feedMode === 'valid'
      ? validEnvelope
      : validEnvelope + 'window.__mpsRemoteCodeExecuted=true;';
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      contentType: 'application/javascript; charset=utf-8',
      body
    });
  });
  const feedPage = await feedContext.newPage();
  await feedPage.goto(base + '/announcements.html', { waitUntil: 'domcontentloaded' });
  await feedPage.waitForFunction(() => document.documentElement.dataset.mpsPublicCenter === 'connected', null, { timeout: 5000 })
    .catch(() => failures.push('Data-only public-center JSON feed did not connect in mocked CORS test'));
  const safeFeedRendered = await feedPage.locator('[data-public-announcements]').innerText();
  if (!safeFeedRendered.includes('Mocked safe feed title')) failures.push('Data-only public-center JSON feed did not render safe announcement text');
  const feedXssSafety = await feedPage.evaluate(() => ({
    titleText: document.querySelector('[data-public-announcements] h3')?.textContent || '',
    injectedImage: !!document.querySelector('[data-public-announcements] img'),
    executed: window.__mpsXssExecuted === true
  }));
  if (!feedXssSafety.titleText.includes('<img')) failures.push('Public-center announcement text was not preserved as inert text');
  if (feedXssSafety.injectedImage || feedXssSafety.executed) failures.push('Public-center announcement content executed HTML instead of rendering as text');
  const feedRemoteScripts = await feedPage.locator('script[src*="script.google.com"]').count();
  if (feedRemoteScripts !== 0) failures.push('Data-only public-center feed injected a remote executable script');

  feedMode = 'malicious';
  await feedPage.goto(base + '/announcements.html?malicious-envelope-test=1', { waitUntil: 'domcontentloaded' });
  await feedPage.waitForFunction(() => document.documentElement.dataset.mpsPublicCenter === 'demo-fallback', null, { timeout: 5000 })
    .catch(() => failures.push('Malformed executable feed envelope did not fail closed to demo fallback'));
  const remoteCodeExecuted = await feedPage.evaluate(() => window.__mpsRemoteCodeExecuted === true);
  if (remoteCodeExecuted) failures.push('Public-center loader executed appended remote JavaScript instead of rejecting the response');
  await feedContext.close();

  if (mobileErrors.length) failures.push('Mobile browser page errors: ' + mobileErrors.join(' | '));
  await mobileContext.close();

  const iosContext = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  await iosContext.route('https://**/*', route => route.abort());
  const iosPage = await iosContext.newPage();
  await iosPage.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  await iosPage.locator('#navToggle').click();
  const iosInstallButton = iosPage.locator('#installMpsApp');
  if (!await iosInstallButton.isVisible()) failures.push('iOS Add to Home Screen helper button did not appear');
  let iosInstructions = '';
  iosPage.once('dialog', async dialog => {
    iosInstructions = dialog.message();
    await dialog.accept();
  });
  await iosInstallButton.click();
  if (!iosInstructions.includes('Safari') || !iosInstructions.includes('Add to Home Screen')) failures.push('iOS install instructions are incomplete');
  await iosContext.close();

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
console.log('Chromium passed 15 pages, SVG/PNG icons, service-worker control, CSS/JS network-first and offline fallback, session/API/HTML cache exclusion, offline navigation, mobile navigation, Android install-prompt flow, iOS Add to Home Screen guidance, and data-only public-center CORS/malformed-payload checks.');
