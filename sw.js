/* ============================================================
   ONS OdontoTécnica — Service Worker v3
   GitHub Pages: caminhos relativos, sem prefixo fixo
   ============================================================ */

const CACHE_VERSION = 'ons-v3';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_CDN     = `${CACHE_VERSION}-cdn`;

/* Arquivos locais do app — caminhos relativos ao SW */
const LOCAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

/* CDN externos — cacheados separadamente */
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

/* ---- INSTALL ---- */
self.addEventListener('install', event => {
  console.log('[SW] Install:', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(cache => {
        return Promise.allSettled(
          LOCAL_FILES.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Não cacheou local:', url, err))
          )
        );
      }),
      caches.open(CACHE_CDN).then(cache => {
        return Promise.allSettled(
          CDN_FILES.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Não cacheou CDN:', url, err))
          )
        );
      })
    ]).then(() => self.skipWaiting())
  );
});

/* ---- ACTIVATE ---- */
self.addEventListener('activate', event => {
  console.log('[SW] Activate:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_CDN)
          .map(k => {
            console.log('[SW] Deletando cache antigo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ---- FETCH — Estratégia híbrida ---- */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* Supabase: sempre network-first (dados em tempo real) */
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  /* Fontes Google / CDN: cache-first */
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') ||
      url.includes('cdnjs.cloudflare.com') || url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_CDN).then(c => c.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  /* Arquivos locais: stale-while-revalidate */
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || fetchPromise || new Response('Offline', { status: 503 });
    })
  );
});

/* ---- MENSAGENS ---- */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
