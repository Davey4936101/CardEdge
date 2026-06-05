import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <span className="font-bold text-sm tracking-tight">CardEdge</span>
        <div className="flex items-center gap-6 text-sm text-slate-500">
          <Link href="#" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            About
          </Link>
          <Link href="#" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            Pricing
          </Link>
          <Link href="#" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            Contact
          </Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 pb-6">
        <p className="text-xs text-slate-400">© 2026 CardEdge. All rights reserved.</p>
      </div>
    </footer>
  )
}
