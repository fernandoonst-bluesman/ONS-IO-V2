/* ============================================================
   ONS OdontoTécnica — Service Worker v4
   GitHub Pages: https://fernandoonst-bluesman.github.io/ONS-IO-V2/
   ============================================================ */

const CACHE_VERSION = 'ons-v4';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_CDN     = `${CACHE_VERSION}-cdn`;
const BASE          = '/ONS-IO-V2';

const LOCAL_FILES = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/sw.js`,
  `${BASE}/icons/icon-192x192.png`,
  `${BASE}/icons/icon-512x512.png`
];

const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

/* ---- INSTALL ---- */
self.addEventListener('install', event => {
  console.log('[SW] Instalando:', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(cache =>
        Promise.allSettled(LOCAL_FILES.map(url =>
          cache.add(url).catch(e => console.warn('[SW] local falhou:', url, e))
        ))
      ),
      caches.open(CACHE_CDN).then(cache =>
        Promise.allSettled(CDN_FILES.map(url =>
          cache.add(url).catch(e => console.warn('[SW] CDN falhou:', url, e))
        ))
      )
    ]).then(() => {
      console.log('[SW] Cache completo. Ativando...');
      return self.skipWaiting();
    })
  );
});

/* ---- ACTIVATE ---- */
self.addEventListener('activate', event => {
  console.log('[SW] Ativando:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_CDN)
            .map(k => { console.log('[SW] Removendo cache antigo:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

/* ---- FETCH ---- */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Supabase → sempre rede (dados em tempo real)
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Google Fonts / CDN → cache-first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') ||
      url.includes('cdnjs.cloudflare.com') || url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_CDN).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Arquivos locais → stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          caches.open(CACHE_STATIC).then(c => c.put(event.request, res.clone()));
        }
        return res;
      }).catch(() => null);
      return cached || network || new Response('Offline', { status: 503 });
    })
  );
});

/* ---- MENSAGENS ---- */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
