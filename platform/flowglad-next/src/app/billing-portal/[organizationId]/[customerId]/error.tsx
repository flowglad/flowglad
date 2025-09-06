'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'

export default function BillingPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const params = useParams()
  const organizationId = params?.organizationId as string

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Billing portal error:', error)
  }, [error])

  const handleSelectDifferentCustomer = () => {
    router.push(`/billing-portal/${organizationId}/select-customer`)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-destructive">
                Unable to Load Billing Portal
              </h3>
              <p className="text-sm text-destructive/80">
                {error.message ||
                  'An unexpected error occurred while loading your billing information.'}
              </p>
              {process.env.NODE_ENV === 'development' &&
                error.message && (
                  <p className="text-xs text-muted-foreground bg-muted rounded-md p-2 font-mono mt-2">
                    {error.message}
                  </p>
                )}
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">What you can try:</h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Check your internet connection</li>
            <li>Refresh the page to try again</li>
            <li>Clear your browser cache and cookies</li>
            <li>
              Try accessing the portal in an incognito/private window
            </li>
            <li>Contact support if the problem persists</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={handleSelectDifferentCustomer}
            className="flex-1 flex items-center justify-center gap-2"
          >
            Select Different Customer
          </Button>
        </div>

        {error.digest && (
          <p className="text-xs text-muted-foreground text-center">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
