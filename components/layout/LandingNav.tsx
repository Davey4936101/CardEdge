import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export function LandingNav() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight">
          CardEdge
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/dashboard" className={buttonVariants({ variant: 'default' })}>
            Get Started
          </Link>
        </div>
      </div>
    </header>
  )
}
