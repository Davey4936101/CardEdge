export type Sport = 'nfl' | 'nba' | 'mlb'

export interface EspnArticle {
  headline: string
  description: string
  publishedAt: string
  url: string
}

const ENDPOINTS: Record<Sport, string> = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news',
  nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news',
  mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news',
}

interface EspnNewsItem {
  headline?: string
  description?: string
  published?: string
  links?: { web?: { href?: string } }
}

interface EspnNewsResponse {
  articles?: EspnNewsItem[]
}

export async function fetchSportNews(sport: Sport, limit = 50): Promise<EspnArticle[]> {
  const url = `${ENDPOINTS[sport]}?limit=${limit}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CardEdge/1.0' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`ESPN ${sport} fetch failed: ${res.status}`)

  const data = (await res.json()) as EspnNewsResponse
  const articles = data.articles ?? []

  return articles
    .filter((a) => a.headline)
    .map((a) => ({
      headline: a.headline ?? '',
      description: a.description ?? '',
      publishedAt: a.published ?? new Date().toISOString(),
      url: a.links?.web?.href ?? '',
    }))
}

export function findPlayerInArticle(
  playerName: string,
  article: EspnArticle
): boolean {
  const text = `${article.headline} ${article.description}`.toLowerCase()
  const nameParts = playerName.toLowerCase().split(/\s+/)
  // Require at least last name match (handles "Mahomes" vs "Patrick Mahomes")
  return nameParts.some((part) => part.length > 3 && text.includes(part))
}
