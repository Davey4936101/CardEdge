import webpush from 'web-push'

interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

export async function sendPushToAll(
  subscriptions: PushSubscription[],
  payload: { title: string; body: string; url: string }
): Promise<void> {
  ensureVapid()
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      )
    )
  )
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) console.warn(`Push: ${failed}/${subscriptions.length} failed`)
}
