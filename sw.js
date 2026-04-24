/* ═══════════════════════════════════════════
   MASAR — Service Worker v2.0
   ✅ يعمل مع TWA / APK / GitHub Pages
═══════════════════════════════════════════ */

const CACHE_NAME = 'masar-v2';

/* الملفات التي تُحفظ فوراً عند التثبيت */
const PRECACHE_ASSETS = [
  './',
  './index.html'
];

/* نطاقات خارجية يُسمح بتخزينها مؤقتاً */
const CACHEABLE_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
];

/* ── Install ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[MASAR SW] Pre-cache warning:', err);
      });
    })
  );
});

/* ── Activate ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch Strategy ──
   - HTML الرئيسي       → Network First (دائماً أحدث نسخة)
   - الخطوط والمكتبات  → Cache First (أداء أفضل)
   - Supabase API       → Network Only (لا تُخزَّن)
   - باقي الطلبات      → Stale While Revalidate
*/
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* تجاهل طلبات POST وغير GET */
  if (request.method !== 'GET') return;

  /* تجاهل Supabase API */
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('supabase.io') ||
      url.hostname.includes('ip-api.com') ||
      url.hostname.includes('ipinfo.io') ||
      url.hostname.includes('ipify.org')) {
    return;
  }

  /* HTML الرئيسي — Network First */
  if (request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  /* الخطوط والمكتبات الخارجية — Cache First */
  if (CACHEABLE_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* الباقي — Stale While Revalidate */
  event.respondWith(staleWhileRevalidate(request));
});

/* ════════════════════════════════
   استراتيجيات الكاش
════════════════════════════════ */

/* Network First: يجرب الشبكة أولاً، يرجع للكاش عند الفشل */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline — يرجى التحقق من الاتصال', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* Cache First: يرجع الكاش أولاً، يجلب من الشبكة إذا لم يوجد */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

/* Stale While Revalidate: يرجع الكاش فوراً ويحدّث في الخلفية */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(response => {
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || networkPromise;
}
