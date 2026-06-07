'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'
import { supabase } from '@/lib/supabase/client'
import type { Alert } from '@/lib/deals/deal-score'

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/deals', label: 'Deals' },
  { href: '/grade', label: 'Grade' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/performance', label: 'Performance' },
]

export function AppNav() {
  const pathname = usePathname()
  const router = useRouter()

  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [])

  useEffect(() => {
    fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Alert[]) =>
        setUnreadCount(Array.isArray(d) ? d.filter((a: Alert) => !a.is_read).length : 0)
      )
  }, [])

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-bold text-xl tracking-tight">
            CardEdge
          </Link>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'text-indigo-500'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          {/* Bell with unread badge */}
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => router.push('/deals')}>
              <Bell className="h-4 w-4" />
              <span className="sr-only">Notifications</span>
            </Button>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>

          <ThemeToggle />

          {/* Sign out */}
          {userEmail && (
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="text-[10px] font-mono text-slate-500 hover:text-slate-300 hidden md:block transition-colors"
            >
              Sign out
            </button>
          )}

          <Avatar className="h-8 w-8 ml-1 hidden md:flex">
            <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {userEmail ? userEmail[0].toUpperCase() : 'DD'}
            </AvatarFallback>
          </Avatar>

          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden" />
              }
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 dark:bg-slate-900 dark:border-slate-800">
              <nav className="flex flex-col gap-1 mt-8">
                {navLinks.map((link) => (
                  <SheetClose
                    key={link.href}
                    render={
                      <Link
                        href={link.href}
                        className={cn(
                          'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          pathname === link.href
                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                        )}
                      />
                    }
                  >
                    {link.label}
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
