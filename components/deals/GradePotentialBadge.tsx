// components/deals/GradePotentialBadge.tsx
interface Props {
  psa10Prob: number | null
  gradeUpside: number | null
}

function fmt(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n))}`
}

export function GradePotentialBadge({ psa10Prob, gradeUpside }: Props) {
  if (psa10Prob === null) {
    // Skeleton — enrichment still in progress
    return (
      <div className="h-8 w-[80px] rounded-md bg-slate-800/60 animate-pulse border border-slate-700/40" />
    )
  }

  const pct = Math.round(psa10Prob * 100)
  const positive = (gradeUpside ?? 0) > 0
  const colour = positive
    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
    : 'bg-slate-700/40 text-slate-500 border-slate-700/60'

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border px-2 py-1 min-w-[72px] text-center ${colour}`}
      title={gradeUpside !== null ? `Grade upside: ${fmt(gradeUpside)} after PSA Regular fees` : undefined}
    >
      <span className="text-[11px] font-bold tabular-nums leading-none">PSA 10: {pct}%</span>
      {gradeUpside !== null && (
        <span className="text-[9px] tabular-nums mt-0.5 opacity-80">{fmt(gradeUpside)} EV</span>
      )}
    </div>
  )
}
