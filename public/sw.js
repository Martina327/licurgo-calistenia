// ---------------------------------------------------------------
// Service worker de Licurgo (RNF03 · PWA)
// Objetivo: que la app abra al instante desde el ícono y que, sin señal,
// muestre la última versión cargada en vez de la pantalla del dinosaurio.
//
//   · Navegación (abrir la app / cambiar de pantalla): primero la red, así
//     siempre llega la última versión publicada; si no hay red, la copia guardada.
//   · /assets/* (JS y CSS de Vite, con hash en el nombre → nunca cambian):
//     primero la caché. Un deploy nuevo trae nombres nuevos.
//   · Íconos y manifest: la caché y se actualiza en segundo plano.
//   · Supabase y cualquier otro dominio: NO se tocan (datos siempre en vivo,
//     nada de datos de alumnos guardados por el service worker).
//
// Para forzar una limpieza total de cachés, cambiar VERSION.
// ---------------------------------------------------------------
const VERSION = 'licurgo-v1'
const CACHE_APP = `${VERSION}-app`
const CACHE_ASSETS = `${VERSION}-assets`
const MAX_ASSETS = 60 // los assets de deploys viejos se van descartando
const BASICOS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase, fuentes, etc.: directo a la red

  if (request.mode === 'navigate') {
    event.respondWith(navegacion(request))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(primeroCache(request))
  } else if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheYActualiza(request))
  }
})

// Toda ruta de la app devuelve el mismo index.html (SPA), así que se guarda una sola copia en "/"
async function navegacion(request) {
  const cache = await caches.open(CACHE_APP)
  try {
    const resp = await fetch(request)
    if (resp.ok) cache.put('/', resp.clone())
    return resp
  } catch {
    return (await cache.match('/')) ?? Response.error()
  }
}

async function primeroCache(request) {
  const cache = await caches.open(CACHE_ASSETS)
  const guardada = await cache.match(request)
  if (guardada) return guardada
  const resp = await fetch(request)
  if (resp.ok) {
    await cache.put(request, resp.clone())
    recortar(cache)
  }
  return resp
}

async function cacheYActualiza(request) {
  const cache = await caches.open(CACHE_APP)
  const guardada = await cache.match(request)
  const red = fetch(request).then((resp) => { if (resp.ok) cache.put(request, resp.clone()); return resp }).catch(() => null)
  return guardada ?? (await red) ?? Response.error()
}

async function recortar(cache) {
  const claves = await cache.keys()
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_ASSETS))) await cache.delete(k)
}
