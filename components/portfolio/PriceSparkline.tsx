interface PricePoint {
  price: number
  date: string
}

interface Props {
  data: PricePoint[]
  width?: number
  height?: number
}

export function PriceSparkline({ data, width = 240, height = 56 }: Props) {
  if (data.length < 2) {
    return <p className="text-xs font-mono text-slate-600">No price history yet</p>
  }

  const prices = data.map((d) => d.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const pad = 4
  const w = width - pad * 2
  const h = height - pad * 2

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * w
    const y = pad + h - ((d.price - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const trend = data[data.length - 1].price >= data[0].price ? '#4ade80' : '#f87171'

  return (
    <div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={trend}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] font-mono text-slate-600">
          {new Date(data[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span className="text-[10px] font-mono text-slate-600">
          {new Date(data[data.length - 1].date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}
