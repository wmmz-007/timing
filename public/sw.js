self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => {})
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
