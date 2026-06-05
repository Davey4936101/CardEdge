'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { AlertCard, type Alert } from './AlertCard'

export function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/alerts')
    const data = (await res.json()) as Alert[]
    setAlerts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()

    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        () => { void load() }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [load])

  async function handleRead(id: string) {
    await fetch(`/api/alerts/${id}`, { method: 'PATCH' })
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
  }

  async function handleMarkAllRead() {
    await fetch('/api/alerts/mark-all-read', { method: 'POST' })
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length

  if (loading) return <p className="text-sm text-slate-400 p-4">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Live Alerts</h2>
          {unreadCount > 0 && (
            <span className="text-xs bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void handleMarkAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          <p className="text-sm font-medium text-slate-500">No alerts yet</p>
          <p className="text-xs text-slate-400 mt-1">Add a watchlist to start scanning.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onRead={(id) => void handleRead(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
