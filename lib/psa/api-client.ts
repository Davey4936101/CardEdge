// lib/psa/api-client.ts

export interface PopData {
  count10: number
  count9: number
  count8: number
  count7: number
  total: number
  gemRate: number
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const username = process.env.PSA_API_USERNAME
  const password = process.env.PSA_API_PASSWORD
  if (!username || !password) return null

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  try {
    const res = await fetch('https://api.psacard.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        username,
        password,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token: string; expires_in: number }
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    return cachedToken.token
  } catch {
    return null
  }
}

// Query PSA population data for a specific card.
// Returns null on any failure — callers must handle gracefully.
export async function getPopData(
  player: string,
  year: number,
  set: string,
  cardNumber: string
): Promise<PopData | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const query = encodeURIComponent(`${player} ${year} ${set} #${cardNumber}`)
    const res = await fetch(
      `https://api.psacard.com/publicapi/pop/GetPopReportBySeries?q=${query}&perPage=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      PSASet?: {
        PSACards?: Array<{
          pop10?: number
          pop9?: number
          pop8?: number
          pop7?: number
          totalGraded?: number
        }>
      }
    }

    const card = data?.PSASet?.PSACards?.[0]
    if (!card) return null

    const count10 = card.pop10 ?? 0
    const count9 = card.pop9 ?? 0
    const count8 = card.pop8 ?? 0
    const count7 = card.pop7 ?? 0
    const total = card.totalGraded ?? count10 + count9 + count8 + count7

    return {
      count10,
      count9,
      count8,
      count7,
      total,
      gemRate: total > 0 ? count10 / total : 0,
    }
  } catch {
    return null
  }
}
