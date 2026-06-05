import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">Settings</h1>

      <div className="space-y-6">
        {/* Account */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Name</p>
              <p className="text-sm text-slate-900 dark:text-slate-100">David Daniel</p>
            </div>
            <Separator className="dark:bg-slate-800" />
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Email</p>
              <p className="text-sm text-slate-900 dark:text-slate-100">
                david_daniel@college.harvard.edu
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Notification preferences will be configurable here.
            </p>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Theme and timezone preferences will be configurable here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
