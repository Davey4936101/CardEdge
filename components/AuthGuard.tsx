'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
    })
  }, [router])
  return <>{children}</>
}
