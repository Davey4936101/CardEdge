'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { AlertFeed } from '@/components/deals/AlertFeed'
import { WatchlistPanel } from '@/components/deals/WatchlistPanel'

export default function DealsPage() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Deal Discovery
        </h1>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger className="text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors mt-1">
            Manage Watchlists ›
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] overflow-y-auto p-0">
            <SheetHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <SheetTitle>Watchlists</SheetTitle>
            </SheetHeader>
            <div className="px-6 py-4">
              <WatchlistPanel />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <AlertFeed onManageWatchlists={() => setSheetOpen(true)} />
    </div>
  )
}
