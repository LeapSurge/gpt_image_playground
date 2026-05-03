self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

async function clearCachesAndUnregister() {
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
  await self.registration.unregister()
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach((client) => client.navigate(client.url))
}

self.addEventListener('activate', (event) => {
  event.waitUntil(clearCachesAndUnregister())
  self.skipWaiting()
})
