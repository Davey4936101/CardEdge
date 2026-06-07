'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="bg-slate-900 rounded-xl p-8 w-full max-w-sm shadow-2xl border border-slate-800">
      <h1 className="font-mono text-amber-400 text-xl font-bold mb-6 tracking-tight">
        CardEdge
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-slate-400 uppercase tracking-widest">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="font-mono bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-slate-400 uppercase tracking-widest">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p className="font-mono text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono text-sm font-semibold rounded-lg py-2.5 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <div className="mt-6 flex flex-col gap-3 text-center">
        <p className="font-mono text-xs text-slate-500">
          No account?{' '}
          <Link href="/signup" className="text-amber-400 hover:text-amber-300 transition-colors">
            Sign up
          </Link>
        </p>
        <Link
          href="/dashboard"
          className="font-mono text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          Continue as guest →
        </Link>
      </div>
    </div>
  )
}
