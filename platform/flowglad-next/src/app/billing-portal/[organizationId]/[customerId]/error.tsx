'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'

export default function Error({
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
    console.error('Billing portal error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-6 p-6">
        <div className="space-y-2">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">
            Something went wrong!
          </h2>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground">
            We encountered an error while loading the billing portal.
          </p>
          {error.message && (
            <p className="text-sm text-muted-foreground bg-muted rounded-md p-3 font-mono">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Try Again
          </button>
          <button
            onClick={() =>
              router.push(
                `/billing-portal/${organizationId}/select-customer`
              )
            }
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          >
            Select Different Customer
          </button>
        </div>
      </div>
    </div>
  )
}
