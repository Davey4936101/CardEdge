// components/grade/EvTable.tsx
import { cn } from '@/lib/utils'
import type { GradeAnalysisRow } from '@/lib/grade/types'

interface Props {
  result: GradeAnalysisRow
}

interface TierRow {
  label: string
  fee: number
  turnaround: string
  ev: number | null
  ep: number | null
}

export function EvTable({ result }: Props) {
  const tiers: TierRow[] = [
    { label: 'Regular', fee: 37, turnaround: '~45 days', ev: result.ev_regular ?? null, ep: result.ep_regular ?? null },
    { label: 'Express', fee: 162, turnaround: '~5 days', ev: result.ev_express ?? null, ep: result.ep_express ?? null },
    { label: 'Super Express', fee: 512, turnaround: '~2 days', ev: result.ev_super_express ?? null, ep: result.ep_super_express ?? null },
  ]

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Expected Value by Grading Tier</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="px-5 py-3 text-left font-medium text-slate-500">Tier</th>
              <th className="px-5 py-3 text-right font-medium text-slate-500">Cost</th>
              <th className="px-5 py-3 text-right font-medium text-slate-500">EV Graded</th>
              <th className="px-5 py-3 text-right font-medium text-slate-500">Exp. Profit</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Turnaround</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tiers.map((tier) => {
              const profitable = tier.ep !== null && tier.ep > 0
              return (
                <tr key={tier.label}>
                  <td className="px-5 py-3 font-medium">{tier.label}</td>
                  <td className="px-5 py-3 text-right font-mono">${(result.raw_price ?? 0) + tier.fee}</td>
                  <td className="px-5 py-3 text-right font-mono">
                    {tier.ev !== null ? `$${tier.ev.toFixed(0)}` : '—'}
                  </td>
                  <td className={cn('px-5 py-3 text-right font-mono font-semibold', profitable ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                    {tier.ep !== null ? `${profitable ? '+' : ''}$${tier.ep.toFixed(0)}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{tier.turnaround}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {result.break_even_grade && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
          Break-even: PSA {result.break_even_grade} or above —{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {((result.break_even_prob ?? 0) * 100).toFixed(0)}% probability
          </span>
        </div>
      )}
    </div>
  )
}
