import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { LandingNav } from '@/components/layout/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <LandingNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-6 py-24 md:py-36 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-slate-100 max-w-4xl mx-auto leading-tight">
            Wall Street tools for the sports card market.
          </h1>
          <p className="mt-6 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            CardEdge synthesizes fair value, population dynamics, and market timing
            into one question: what should you do right now?
          </p>
          <div className="mt-10">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'bg-indigo-600 hover:bg-indigo-700 text-white'
              )}
            >
              Open Dashboard
            </Link>
          </div>
        </section>

        {/* Feature callouts */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-12">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Deal Discovery
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Live deal scanning across marketplaces. Real-time alerts when cards
                are priced below fair value.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Portfolio Intelligence
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                True cost basis. Population monitoring. Concentration risk. Know
                your exposure at all times.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Exit Optimization
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Sell signals that synthesize cost basis, pop trajectory, player news,
                and timing into a clear recommendation.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
