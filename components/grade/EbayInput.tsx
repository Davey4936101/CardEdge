'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface EbayMeta {
  itemId: string
  title: string
  price: number | null
}

interface Props {
  onImagesLoaded: (urls: string[], meta: EbayMeta) => void
}

export function EbayInput({ onImagesLoaded }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFetch() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/grade/ebay-images?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const { error: e } = (await res.json()) as { error: string }
        setError(e ?? 'Failed to fetch listing')
        return
      }
      const data = (await res.json()) as { itemId: string; title: string; price: number | null; imageUrls: string[] }
      if (!data.imageUrls.length) {
        setError('No images found in this listing')
        return
      }
      onImagesLoaded(data.imageUrls, { itemId: data.itemId, title: data.title, price: data.price })
    } catch {
      setError('Could not reach eBay. Check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
        eBay Listing URL
      </label>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.ebay.com/itm/..."
          className="flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <Button onClick={handleFetch} disabled={!url || loading}>
          {loading ? 'Fetching…' : 'Fetch Photos'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
