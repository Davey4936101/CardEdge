'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwStatus, setPwStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setPwStatus('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) {
      setPwStatus(`Error: ${error.message}`)
    } else {
      setPwStatus('Password updated successfully.')
      setNewPassword('')
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <button
          onClick={handleSignOut}
          className="text-xs font-mono text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400 px-3 py-1.5 rounded transition-colors"
        >
          Sign Out
        </button>
      </div>

      <div className="space-y-6">
        {/* Account */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Email</p>
              <p className="text-sm text-slate-100">{email ?? '—'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-xs font-mono text-slate-500 block mb-1">NEW PASSWORD</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm font-mono px-3 py-2 rounded focus:outline-none focus:border-amber-400"
                />
              </div>
              {pwStatus && (
                <p className={`text-xs font-mono ${pwStatus.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {pwStatus}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="text-xs font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 px-4 py-2 rounded transition-colors"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPreferences />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
