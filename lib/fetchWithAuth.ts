import { supabase } from './supabase/client'

export async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  })
}
