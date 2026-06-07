import Anthropic from '@anthropic-ai/sdk'
import type { EspnArticle } from './espn'

export type EventType = 'award' | 'trade' | 'injury' | 'milestone' | 'performance' | 'other'
export type Sentiment = 'bullish' | 'bearish' | 'neutral'
export type Severity = 'high' | 'medium' | 'low'

export interface ClassifiedEvent {
  event_type: EventType
  sentiment: Sentiment
  severity: Severity
  summary: string
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You classify sports news articles for sports card investors.
Given a news headline, description, and player name, return JSON with:
- event_type: "award" | "trade" | "injury" | "milestone" | "performance" | "other"
- sentiment: "bullish" (good for card value) | "bearish" (bad for card value) | "neutral"
- severity: "high" (major impact) | "medium" | "low"
- summary: one sentence about why this matters for card investors

Injury = bearish. Award/MVP/All-Star = bullish. Trade to bigger market = bullish. Retirement = bearish. Record/milestone = bullish.
Return ONLY valid JSON, no markdown.`

export async function classifyArticle(
  article: EspnArticle,
  playerName: string
): Promise<ClassifiedEvent> {
  const prompt = `Player: ${playerName}
Headline: ${article.headline}
Description: ${article.description.slice(0, 300)}`

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
    system: SYSTEM,
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''

  try {
    return JSON.parse(text) as ClassifiedEvent
  } catch {
    return {
      event_type: 'other',
      sentiment: 'neutral',
      severity: 'low',
      summary: article.headline,
    }
  }
}
