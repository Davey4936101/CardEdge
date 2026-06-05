export interface Comp {
  price: number
  saleDate: Date
}

export interface FairValueResult {
  fairValue: number
  compCount: number
  oldestComp: Date
  newestComp: Date
}

export function calculateFairValue(comps: Comp[]): FairValueResult | null {
  if (comps.length < 3) return null

  const now = new Date()
  let weightedSum = 0
  let weightSum = 0
  let oldest = comps[0].saleDate
  let newest = comps[0].saleDate

  for (const comp of comps) {
    const daysAgo =
      (now.getTime() - comp.saleDate.getTime()) / (1000 * 60 * 60 * 24)
    const weight = 1 / (daysAgo + 1)
    weightedSum += comp.price * weight
    weightSum += weight
    if (comp.saleDate < oldest) oldest = comp.saleDate
    if (comp.saleDate > newest) newest = comp.saleDate
  }

  return {
    fairValue: weightedSum / weightSum,
    compCount: comps.length,
    oldestComp: oldest,
    newestComp: newest,
  }
}

export function calculateRoiPct(listedPrice: number, fairValue: number): number {
  return ((fairValue - listedPrice) / fairValue) * 100
}
