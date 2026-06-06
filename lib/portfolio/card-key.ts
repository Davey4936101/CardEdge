export function buildPortfolioCardKey(
  player: string,
  setName: string,
  year: string | null,
  grade: string | null
): string {
  const parts = [player, setName, year, grade].filter(Boolean) as string[]
  return parts
    .map((s) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
