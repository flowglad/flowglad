'use client'

import { useRealtimeRun } from '@trigger.dev/react-hooks'

interface BillingRunRealtimeInfo {
  runId: string
  publicAccessToken: string
}

interface UseBillingRunRealtimeOptions {
  billingRunRealtime: BillingRunRealtimeInfo | null
  onComplete: () => void
  onError?: (error: Error) => void
}

/**
 * Hook that subscribes to a trigger.dev billing run and calls onComplete when it finishes.
 * This replaces polling with realtime updates from trigger.dev.
 *
 * Uses the useRealtimeRun hook's onComplete callback which fires when the run
 * completes (successfully or with an error).
 */
export function useBillingRunRealtime({
  billingRunRealtime,
  onComplete,
  onError,
}: UseBillingRunRealtimeOptions) {
  const { run, error } = useRealtimeRun(
    billingRunRealtime?.runId ?? '',
    {
      accessToken: billingRunRealtime?.publicAccessToken ?? '',
      enabled: !!billingRunRealtime,
      onComplete: (completedRun, err) => {
        if (err) {
          console.error('Billing run error:', err)
          onError?.(err)
        } else {
          console.log(
            'Billing run completed via realtime:',
            completedRun.id
          )
          onComplete()
        }
      },
    }
  )

  return {
    run,
    error,
    isWaiting: !!billingRunRealtime && run?.status === 'EXECUTING',
  }
}
