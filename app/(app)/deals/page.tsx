import { AlertFeed } from '@/components/deals/AlertFeed'
import { WatchlistPanel } from '@/components/deals/WatchlistPanel'

export default function DealsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Deal Discovery</h1>
        <p className="text-sm text-slate-400 mt-1">
          Live scanning across eBay for cards priced below fair value.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <AlertFeed />
        <WatchlistPanel />
      </div>
    </div>
  )
}
