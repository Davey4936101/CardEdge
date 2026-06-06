// components/grade/CaveatList.tsx
import { Info } from 'lucide-react'

interface Props {
  caveats: string[]
}

export function CaveatList({ caveats }: Props) {
  if (!caveats.length) return null

  return (
    <div className="space-y-2">
      {caveats.map((caveat, i) => (
        <div key={i} className="flex items-start gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
          <p>{caveat}</p>
        </div>
      ))}
    </div>
  )
}
