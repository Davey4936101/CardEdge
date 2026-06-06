// components/grade/ModeToggle.tsx
'use client'

type Mode = 'ebay' | 'personal'

interface Props {
  mode: Mode
  onChange: (mode: Mode) => void
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-1">
      {(['ebay', 'personal'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === m
              ? 'bg-indigo-500 text-white'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          {m === 'ebay' ? 'eBay Listing' : 'My Card'}
        </button>
      ))}
    </div>
  )
}
