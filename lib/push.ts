import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushToAll(
  subscriptions: PushSubscription[],
  payload: { title: string; body: string; url: string }
): Promise<void> {
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
