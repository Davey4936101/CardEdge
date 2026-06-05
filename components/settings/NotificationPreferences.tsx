'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, Mail, Smartphone } from 'lucide-react'

interface Prefs {
  email_enabled: boolean
  email_address: string | null
  push_enabled: boolean
  in_app_enabled: boolean
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>({
    email_enabled: false,
    email_address: null,
    push_enabled: false,
    in_app_enabled: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => r.json() as Promise<Prefs>)
      .then(setPrefs)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      const data = (await res.json()) as Prefs
      setPrefs(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleEnablePush() {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })

    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
    })

    setPrefs((p) => ({ ...p, push_enabled: true }))
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <div className="space-y-6">
      {/* In-app */}
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
          <Bell className="size-5 text-indigo-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">In-app alerts</p>
              <p className="text-xs text-slate-500 mt-0.5">Always on — alerts appear in the Deal Discovery feed.</p>
            </div>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded">Always on</span>
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
          <Mail className="size-5 text-indigo-500" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Email alerts</p>
              <p className="text-xs text-slate-500 mt-0.5">Get an email for each new deal alert.</p>
            </div>
            <button
              role="switch"
              aria-checked={prefs.email_enabled}
              onClick={() => setPrefs((p) => ({ ...p, email_enabled: !p.email_enabled }))}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                prefs.email_enabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  prefs.email_enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {prefs.email_enabled && (
            <input
              type="email"
              placeholder="your@email.com"
              value={prefs.email_address ?? ''}
              onChange={(e) => setPrefs((p) => ({ ...p, email_address: e.target.value }))}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>
      </div>

      {/* Browser push */}
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
          <Smartphone className="size-5 text-indigo-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Browser push</p>
              <p className="text-xs text-slate-500 mt-0.5">Instant notifications in this browser.</p>
            </div>
            {prefs.push_enabled ? (
              <span className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800">Enabled</span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void handleEnablePush()}>
                Enable
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
        {saved && <span className="text-sm text-emerald-500">Saved!</span>}
      </div>
    </div>
  )
}
