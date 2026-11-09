const CACHE_NAME='mps-public-shell-v5';
const CACHE_PREFIX='mps-public-shell-';
const BASE=self.registration.scope;
const CORE_ASSETS=[
  'offline.html',
  'css/style.css',
  'js/main.js',
  'config.js',
  'assets/logo.svg',
  'assets/favicon.svg',
  'assets/mps-app-icon.svg',
  'assets/mps-app-icon-512.png'
].map(path=>new URL(path,BASE).href);

// Explicit allowlist: never cache arbitrary same-origin paths or dynamic endpoints.
const PUBLIC_ASSET_PATHS=new Set([
  '/css/style.css',
  '/js/main.js',
  '/config.js',
  '/assets/logo.svg',
  '/assets/favicon.svg',
  '/assets/mps-app-icon.svg',
  '/assets/mps-app-icon-512.png'
]);
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

  // Permit only a single non-empty version parameter on explicitly public assets.
  // Session, token, auth, and all other parameterized requests bypass the cache.
  if(url.hash)return;
  const isPublicAsset=PUBLIC_ASSET_PATHS.has(url.pathname);
  const isVersionedPublicAsset=isPublicAsset&&url.searchParams.size===1&&
    url.searchParams.has('v')&&url.searchParams.get('v')!=='';
  if(url.search&&!isVersionedPublicAsset)return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match(OFFLINE_URL)))
    );
    return;
  }

  if(!isPublicAsset)return;

  const isCode=url.pathname==='/css/style.css'||
    url.pathname==='/js/main.js'||
    url.pathname==='/config.js';

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache=>{
      if(isCode){
        try{
          const response=await fetch(request);
          const cacheControl=(response.headers.get('Cache-Control')||'').toLowerCase();
          if(response.ok&&response.type==='basic'&&
             !/private|no-store|no-cache/.test(cacheControl)){
            await cache.put(request,response.clone());
          }
          return response;
        }catch(error){
          const cached=await cache.match(request);
          if(cached)return cached;
          throw error;
        }
      }

      const cached=await cache.match(request);
      if(cached)return cached;

      const response=await fetch(request);
      const cacheControl=(response.headers.get('Cache-Control')||'').toLowerCase();
      if(response.ok&&response.type==='basic'&&
         !/private|no-store|no-cache/.test(cacheControl)){
        await cache.put(request,response.clone());
      }
      return response;
    })
  );
});
