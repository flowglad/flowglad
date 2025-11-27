'use client'

import {
  AlertCircle,
  ArrowRight,
  HelpCircle,
  Home,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function BillingPortalRootPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-2xl w-full shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="h-10 w-10 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-3xl font-bold">
            Organization Required
          </CardTitle>
          <CardDescription className="text-lg">
            To access the billing portal, you need to specify an
            organization
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-medium">
                  How to access your billing portal:
                </p>
                <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
                  <li>
                    Get your organization ID from your account
                    settings
                  </li>
                  <li>
                    Navigate to{' '}
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      /billing-portal/[organizationId]
                    </code>
                  </li>
                  <li>
                    Select your customer profile if you have multiple
                  </li>
                  <li>
                    Manage your subscription, payment methods, and
                    invoices
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Example URL format:</p>
            <div className="bg-muted/50 rounded px-3 py-2">
              <code className="text-xs break-all">
                /billing-portal/org_abc123xyz/select-customer
              </code>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <div className="flex gap-3">
              <div className="shrink-0">
                <svg
                  className="h-5 w-5 text-blue-600 dark:text-blue-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Need your organization ID?
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  You can find your organization ID in your account
                  settings or contact support for assistance.
                </p>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => router.push('/')}
          >
            <Home className="mr-2 h-4 w-4" />
            Return Home
          </Button>
          <Button
            variant="default"
            className="w-full sm:w-auto"
            onClick={() =>
              router.push('/settings/organization-details')
            }
          >
            Go to Settings
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
