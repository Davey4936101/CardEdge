import type { Sport } from './espn'

export type SeasonalAction = 'sell' | 'buy' | 'hold'

export interface SeasonalWindow {
  label: string
  action: SeasonalAction
  reason: string
  months: number[] // 1-12
}

const WINDOWS: Record<Sport, SeasonalWindow[]> = {
  nfl: [
    { label: 'Playoffs Peak', action: 'sell', reason: 'Playoff hype drives card prices to yearly highs', months: [1, 2] },
    { label: 'Super Bowl Week', action: 'sell', reason: 'Maximum attention on NFL stars — ideal exit window', months: [2] },
    { label: 'NFL Draft', action: 'buy', reason: 'Rookie cards debut — buy early before prices spike', months: [4] },
    { label: 'Offseason Dip', action: 'buy', reason: 'Low media coverage, prices often at yearly lows', months: [6, 7, 8] },
    { label: 'Regular Season', action: 'hold', reason: 'Steady market, watch for breakout performances', months: [9, 10, 11, 12] },
  ],
  nba: [
    { label: 'Playoffs Peak', action: 'sell', reason: 'NBA Playoffs drive highest card prices of the year', months: [4, 5, 6] },
    { label: 'NBA Finals', action: 'sell', reason: 'Championship moment — peak demand for winners', months: [6] },
    { label: 'Draft Day', action: 'buy', reason: 'Rookie cards before mainstream hype — best entry price', months: [6] },
    { label: 'Offseason', action: 'buy', reason: 'Free agency noise fades — accumulate undervalued cards', months: [7, 8, 9] },
    { label: 'Regular Season', action: 'hold', reason: 'Monitor performance trends before moving', months: [10, 11, 12, 1, 2, 3] },
  ],
  mlb: [
    { label: 'Playoffs', action: 'sell', reason: 'October baseball drives peak attention and card prices', months: [10] },
    { label: 'World Series', action: 'sell', reason: 'Champions get immediate card price premium', months: [10, 11] },
    { label: 'Hot Stove', action: 'buy', reason: 'Trade rumors keep prices low — buy before spring', months: [11, 12] },
    { label: 'Spring Training', action: 'hold', reason: 'Monitor injury news before committing capital', months: [2, 3] },
    { label: 'Regular Season', action: 'hold', reason: 'Watch for milestones (HR records, .400 avg) as sell triggers', months: [4, 5, 6, 7, 8, 9] },
  ],
}

export interface CurrentWindow {
  sport: Sport
  window: SeasonalWindow
}

export function getCurrentWindows(sports: Sport[]): CurrentWindow[] {
  const month = new Date().getMonth() + 1 // 1-12
  return sports.map((sport) => {
    const windows = WINDOWS[sport]
    const match = windows.find((w) => w.months.includes(month))
    return { sport, window: match ?? windows[windows.length - 1] }
  })
}

export function getAllWindows(sport: Sport): SeasonalWindow[] {
  return WINDOWS[sport]
}
