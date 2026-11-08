const CACHE_NAME='mps-public-shell-v2';
const CACHE_PREFIX='mps-public-shell-';
const BASE=self.registration.scope;
const CORE_ASSETS=[
  'offline.html',
  'css/style.css',
  'assets/logo.svg',
  'assets/favicon.svg',
  'assets/mps-app-icon.svg',
  'assets/mps-app-icon-512.png'
].map(path=>new URL(path,BASE).href);
const OFFLINE_URL=new URL('offline.html',BASE).href;

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(CORE_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)
          .map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match(OFFLINE_URL)))
    );
    return;
  }

  if(url.searchParams.has('session')||url.searchParams.has('token'))return;

  // Only cache same-origin static assets; do not cache API or member data.
  const isStatic=/\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname);
  if(!isStatic)return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache=>{
      const cached=await cache.match(request);
      if(cached)return cached;

      const response=await fetch(request);
      if(response&&response.ok&&response.type==='basic'){
        await cache.put(request,response.clone());
      }
      return response;
    })
  );
});
