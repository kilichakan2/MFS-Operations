// Service worker: clear all caches and self-deregister.
// This replaces a stale pre-built SW that was caching outdated assets.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', async () => {
  // Delete every cache
  const keys = await caches.keys()
  await Promise.all(keys.map(k => caches.delete(k)))
  // Unregister this SW so the browser goes back to network-only
  await self.registration.unregister()
  // Force all open tabs to reload with fresh assets
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach(c => c.navigate(c.url))
})
