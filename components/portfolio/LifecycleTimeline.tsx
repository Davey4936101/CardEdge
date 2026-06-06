import type { PortfolioCard } from '@/lib/portfolio/types'

const STEPS = [
  { key: 'raw_owned', label: 'PURCHASED' },
  { key: 'submitted', label: 'SUBMITTED' },
  { key: 'graded_owned', label: 'GRADED' },
  { key: 'sold', label: 'SOLD' },
] as const

const ORDER: Record<string, number> = {
  raw_owned: 0,
  submitted: 1,
  graded_owned: 2,
  sold: 3,
}

function stepDate(card: PortfolioCard, key: string): string | null {
  if (key === 'raw_owned') return card.raw_purchase_date
  if (key === 'submitted') return card.submitted_at
  if (key === 'graded_owned') return card.received_at
  if (key === 'sold') return card.sold_at
  return null
}

interface Props {
  card: PortfolioCard
  onAdvance: (action: 'submit' | 'grade' | 'sell') => void
}

export function LifecycleTimeline({ card, onAdvance }: Props) {
  const currentIdx = ORDER[card.status] ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-start">
        {STEPS.map((step, idx) => {
          const complete = idx < currentIdx
          const current = idx === currentIdx
          const date = stepDate(card, step.key)

          return (
            <div key={step.key} className="flex-1 flex flex-col items-center">
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <div
                    className={`flex-1 h-px ${complete || current ? 'bg-amber-400' : 'bg-slate-700'}`}
                  />
                )}
                <div
                  className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${
                    complete
                      ? 'bg-amber-400 border-amber-400'
                      : current
                        ? 'bg-slate-900 border-amber-400'
                        : 'bg-slate-900 border-slate-700'
                  }`}
                />
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${complete ? 'bg-amber-400' : 'bg-slate-700'}`}
                  />
                )}
              </div>
              <p className="text-[10px] font-mono text-slate-500 mt-1 text-center">{step.label}</p>
              {date && (
                <p className="text-[10px] font-mono text-amber-400 text-center">
                  {new Date(date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit',
                  })}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {card.status === 'raw_owned' && (
        <button
          onClick={() => onAdvance('submit')}
          className="w-full text-[11px] font-mono text-amber-400 border border-amber-400/40 hover:border-amber-400 py-1.5 rounded transition-colors"
        >
          MARK SUBMITTED →
        </button>
      )}
      {card.status === 'submitted' && (
        <button
          onClick={() => onAdvance('grade')}
          className="w-full text-[11px] font-mono text-amber-400 border border-amber-400/40 hover:border-amber-400 py-1.5 rounded transition-colors"
        >
          ENTER RECEIVED GRADE →
        </button>
      )}
      {card.status === 'graded_owned' && (
        <button
          onClick={() => onAdvance('sell')}
          className="w-full text-[11px] font-mono text-green-400 border border-green-400/40 hover:border-green-400 py-1.5 rounded transition-colors"
        >
          RECORD SALE →
        </button>
      )}
    </div>
  )
}
