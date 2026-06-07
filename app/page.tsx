import Link from 'next/link'
import { LandingNav } from '@/components/layout/LandingNav'
import { Footer } from '@/components/layout/Footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <LandingNav />
      <main className="flex-1">

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 py-24 md:py-36 text-center">
          <div className="inline-block text-[11px] font-mono text-emerald-400 border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 rounded-full mb-6 uppercase tracking-wider">
            Beta — Free Access
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-100 max-w-4xl mx-auto leading-tight">
            Know exactly what to buy,{' '}
            <span className="text-indigo-400">hold,</span>{' '}
            and sell.
          </h1>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            CardEdge runs real-time eBay analysis to find undervalued cards, predict PSA grades, and tell you when to exit positions.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/signup"
              className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-lg transition-colors"
            >
              Start Free →
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-6 py-3 rounded-lg transition-colors"
            >
              See the Dashboard
            </Link>
          </div>
          {/* Stat bar */}
          <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
            {['13 market queries/min', '90-day comp window', 'PSA EV engine', 'eBay sold data'].map((s) => (
              <span key={s} className="text-[11px] font-mono text-slate-600">{s}</span>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-slate-800 bg-slate-900/40">
          <div className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-10">
            <div>
              <div className="text-amber-400 text-xl mb-3">⚡</div>
              <h3 className="font-semibold text-slate-100 mb-2 text-sm">Deal Discovery</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Live eBay scanning with fair-value scoring. Get alerts when cards are listed below market — before anyone else sees them.
              </p>
            </div>
            <div>
              <div className="text-amber-400 text-xl mb-3">🎯</div>
              <h3 className="font-semibold text-slate-100 mb-2 text-sm">PSA Pre-Grade</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Know if a card is worth grading before you ship it. EV engine calculates expected profit across PSA 7–10 grade scenarios.
              </p>
            </div>
            <div>
              <div className="text-amber-400 text-xl mb-3">📊</div>
              <h3 className="font-semibold text-slate-100 mb-2 text-sm">Portfolio Intelligence</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                True cost basis tracking, realized/unrealized P&L, and sell signals across every card you own.
              </p>
            </div>
          </div>
        </section>

        {/* Social proof */}
        <section className="border-t border-slate-800">
          <div className="max-w-5xl mx-auto px-6 py-12 text-center">
            <p className="text-sm font-mono text-slate-500 mb-6">
              &quot;Built for serious collectors who think in ROI, not vibes.&quot;
            </p>
            <div className="flex items-center justify-center gap-8 flex-wrap">
              {[
                { value: '+23%', label: 'avg deal ROI' },
                { value: '< 2min', label: 'grade decision' },
                { value: '$0', label: 'bad grades shipped' },
                { value: '90d', label: 'comp lookback' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-xl font-bold font-mono text-emerald-400">{value}</p>
                  <p className="text-[11px] font-mono text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t border-slate-800 bg-slate-900/40">
          <div className="max-w-5xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-slate-100 text-center mb-10">Pricing</h2>
            <div className="max-w-sm mx-auto rounded-xl border border-emerald-400/30 bg-slate-900 p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-100">Full Access</h3>
                <span className="text-[10px] font-mono font-bold text-emerald-400 border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 rounded uppercase">BETA — FREE</span>
              </div>
              <p className="text-3xl font-bold text-slate-100 font-mono mb-1">$0</p>
              <p className="text-xs text-slate-500 mb-6">No credit card required during beta.</p>
              <ul className="space-y-2 mb-8">
                {[
                  'Live Deal Scanner',
                  'PSA Pre-Grade EV',
                  'Portfolio Tracker',
                  'Performance Analytics',
                  'Sell Signal Engine',
                  'eBay Comp Analysis',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="block w-full text-center text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-lg transition-colors"
              >
                Get Started Free →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
