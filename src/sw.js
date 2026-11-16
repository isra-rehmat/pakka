/* Pakka service worker: offline app shell + push notifications */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const BASE = import.meta.env.BASE_URL
const scoped = (u) => new URL(String(u || '').replace(/^\//, ''), self.registration.scope).href

registerRoute(new NavigationRoute(createHandlerBoundToURL(BASE + 'index.html'), { denylist: [/\/privacy/] }))
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'google-fonts', plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31536000 })] })
)

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Pakka', {
      body: d.body || '',
      icon: scoped('icon-192.png'),
      badge: scoped('badge-96.png'),
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      data: { url: d.url || '/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = scoped((event.notification.data && event.notification.data.url) || '/')
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) {
        await c.focus()
        c.postMessage({ type: 'pakka-nav', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
