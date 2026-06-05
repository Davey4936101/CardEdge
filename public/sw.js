self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title ?? 'CardEdge Alert'
  const options = {
    body: data.body ?? '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url ?? '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
