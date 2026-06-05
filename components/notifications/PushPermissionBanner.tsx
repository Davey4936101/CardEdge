'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, X } from 'lucide-react'

interface PushPermissionBannerProps {
  onSubscribed: (sub: { endpoint: string; p256dh: string; auth: string }) => void
}

export function PushPermissionBanner({ onSubscribed }: PushPermissionBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)

  if (dismissed || typeof window === 'undefined' || !('Notification' in window)) return null
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return null

  async function handleEnable() {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setDismissed(true); return }

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const payload = { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      onSubscribed(payload)
      setDismissed(true)
    } catch (err) {
      console.error('Push subscription failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg">
      <div className="flex items-center gap-3">
        <Bell className="size-5 text-indigo-500 flex-shrink-0" />
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Enable browser push notifications for instant deal alerts.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button size="sm" onClick={() => void handleEnable()} disabled={loading}>
          {loading ? 'Enabling…' : 'Enable'}
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
