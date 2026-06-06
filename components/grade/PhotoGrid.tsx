'use client'

interface Props {
  imageUrls: string[]
  mode: 'ebay' | 'personal'
}

const STEP_LABELS = ['Front', 'Back', 'Top-left', 'Top-right', 'Bottom-left', 'Bottom-right', 'Raking Light']

export function PhotoGrid({ imageUrls, mode }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {imageUrls.length} photo{imageUrls.length !== 1 ? 's' : ''} loaded
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {imageUrls.map((url, i) => (
          <div key={url} className="relative aspect-[2.5/3.5] rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img src={url} alt={`Photo ${i + 1}`} className="object-cover w-full h-full" />
            {mode === 'personal' && (
              <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                {STEP_LABELS[i] ?? `Photo ${i + 1}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
