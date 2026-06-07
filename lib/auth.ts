import { createAnonClient } from './supabase/server'

export async function getUserFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data } = await createAnonClient().auth.getUser(token)
  return data.user?.id ?? null
}
