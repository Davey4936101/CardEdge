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
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          <p className="text-sm font-medium text-slate-500">Live Alerts</p>
          <p className="text-xs text-slate-400 mt-1">Alerts will appear here once the scanner is running.</p>
        </div>
        <WatchlistPanel />
      </div>
    </div>
  )
}
