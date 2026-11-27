// Service worker: deja la app disponible sin internet y se actualiza sola.
// Cambia VERSION cada vez que subas cambios importantes.
const VERSION = 'torre-v2';
const ARCHIVOS = ['./', './index.html', './style.css', './sync.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;   // clima, fotos, IA: directo a internet
  // primero la red (así ves tus actualizaciones), y si no hay internet, lo guardado
  e.respondWith(fetch(r).then(res => {
    const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); return res;
  }).catch(() => caches.match(r).then(m => m || caches.match('./index.html'))));
});
