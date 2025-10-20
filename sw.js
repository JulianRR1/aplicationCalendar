
const STATIC_CACHE = 'app-shell-v2';
const DYNAMIC_CACHE = 'dynamic-cache-v1';
const DYNAMIC_HTML_CACHE = 'dynamic-shell-v1';

const scopeURL = new URL(self.registration.scope);

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './about.html',
  './style.css',
  './register.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://cdn.tailwindcss.com'
];


const DYNAMIC_ASSET_URLS = [
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/main.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/js/select2.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.min.css'
];

const normalizeUrl = (u) => {
  try { return new URL(u).href; } catch { return new URL(u, scopeURL).href; }
};

const isSame = (a, b) => normalizeUrl(a) === normalizeUrl(b);

const isAppShellAsset = (requestUrl) => {
  const req = normalizeUrl(requestUrl);
  return APP_SHELL_ASSETS.some(asset => isSame(req, asset));
};

const isDynamicAsset = (requestUrl) => {
  const req = normalizeUrl(requestUrl);
  return DYNAMIC_ASSET_URLS.some(asset => isSame(req, asset));
};

const isDynamicHTML = (requestUrl) => {
  try {
    const { pathname } = new URL(requestUrl);
    return pathname.endsWith('/calendar.html') || pathname.endsWith('/form.html');
  } catch {
    return false;
  }
};


self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    try {
      await cache.addAll(APP_SHELL_ASSETS);
      console.log('[SW] Precargado AppShell OK');
    } catch (err) {
      console.warn('[SW] addAll falló, intentando añadir uno por uno:', err);
      for (const asset of APP_SHELL_ASSETS) {
        try { await cache.add(asset); } catch (e) { console.warn('[SW] No se pudo cachear', asset, e); }
      }
    }
  })());
  self.skipWaiting();
});



self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![STATIC_CACHE, DYNAMIC_CACHE, DYNAMIC_HTML_CACHE].includes(k)) {
        console.log('[SW] Borrando caché antiguo:', k);
        return caches.delete(k);
      }
    }));
  })());
  self.clients.claim();
});


self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  if (isAppShellAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const netRes = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, netRes.clone());
        console.log('[SW] AppShell obtenido desde red y guardado:', url);
        return netRes;
      } catch (err) {
        console.warn('[SW] AppShell no disponible en caché ni en red:', url, err);
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  if (isDynamicHTML(url) || (req.mode === 'navigate' && isDynamicHTML(url))) {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req);
        const cache = await caches.open(DYNAMIC_HTML_CACHE);
        cache.put(req, netRes.clone());
        console.log('[SW] Guardada copia local de página dinámica:', url);
        return netRes;
      } catch (err) {
        console.warn('[SW] Red no disponible, intentando copia local de página dinámica:', url, err);
        const cache = await caches.open(DYNAMIC_HTML_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response(`<!doctype html>
<html lang="es"><meta charset="utf-8"><title>Offline</title>
<body style="font-family:system-ui;padding:2rem">
<h1>Sin conexión</h1>
<p>No hay una copia local disponible aún de esta página.</p>
<a href="./index.html">Volver al inicio</a>
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  if (isDynamicAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(DYNAMIC_CACHE);
      const cached = await cache.match(req, { ignoreVary: true });
      if (cached) return cached;
      try {
        const fresh = await fetch(req, { mode: 'cors' });
        if (fresh && (fresh.ok || fresh.type === 'opaque')) {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        console.warn('[SW] Recurso dinámico no disponible y sin caché:', url, err);
        // Respuestas fallback según tipo
        if (req.destination === 'style') {
          return new Response('/* fallback css */', { headers: { 'Content-Type': 'text/css' } });
        }
        if (req.destination === 'script') {
          return new Response('', { headers: { 'Content-Type': 'application/javascript' } });
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

});