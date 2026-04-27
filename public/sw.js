/**
 * public/sw.js
 * Service worker for MFS Operations PWA.
 * Handles push notifications for HACCP overdue alarms.
 *
 * Requirements:
 * - PWA must be installed to Home Screen
 * - User must grant notification permission once
 * - iOS 16.4+ required for Web Push
 */

self.addEventListener('install', () => { self.skipWaiting() })

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: '⚠️ MFS HACCP Alert', body: 'Overdue check — please open the app', url: '/haccp', tag: 'haccp-alarm', requireInteraction: true }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (e) {
    console.error('[sw] Push parse error:', e)
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:               data.body,
      icon:               '/icons/icon-192.png',
      badge:              '/icons/icon-192.png',
      tag:                data.tag,
      renotify:           true,
      requireInteraction: data.requireInteraction,
      data:               { url: data.url ?? '/haccp' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/haccp'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
