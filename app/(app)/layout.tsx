import { AppNav } from '@/components/layout/AppNav'
import { AuthGuard } from '@/components/AuthGuard'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
        <AppNav />
        <main className="flex-1">{children}</main>
      </div>
    </AuthGuard>
  )
}
