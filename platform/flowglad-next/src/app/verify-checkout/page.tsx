'use client'
import { redirect, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  CheckoutSession,
  GetIntentStatusInput,
} from '@/db/schema/checkoutSessions'
import {
  getCheckoutSessionIntentStatusOutput,
  getPaymentIntentIntentStatusOutput,
  getSetupIntentIntentStatusOutput,
  GetCheckoutSessionIntentStatusOutput,
  GetPaymentIntentIntentStatusOutput,
  GetSetupIntentIntentStatusOutput,
} from '@/utils/bookkeeping/intentStatus'
import { z } from 'zod'
import { CheckoutSessionStatus } from '@/types'

const getIntentStatusInput = (
  searchParams: URLSearchParams
): GetIntentStatusInput => {
  const paymentIntentId = searchParams.get('payment_intent')
  if (paymentIntentId) {
    return { type: 'paymentIntent', paymentIntentId }
  }
  const setupIntentId = searchParams.get('setup_intent')
  if (setupIntentId) {
    return { type: 'setupIntent', setupIntentId }
  }
  const checkoutSessionId = searchParams.get('checkout_session')
  if (checkoutSessionId) {
    return { type: 'checkoutSession', checkoutSessionId }
  }
  throw new Error('No intent ID found in URL parameters')
}

const successUrlForCheckoutSession = (
  checkoutSession: CheckoutSession.ClientRecord
) => {
  return (
    checkoutSession.successUrl ??
    `/checkout/${checkoutSession.id}/success`
  )
}

const failureUrlForCheckoutSession = (
  checkoutSession: CheckoutSession.ClientRecord
) => {
  return (
    checkoutSession.cancelUrl ??
    `/checkout/${checkoutSession.id}/failure`
  )
}

function CheckoutSessionStatusPage({
  input,
  intentStatus,
}: {
  input: GetIntentStatusInput
  intentStatus: z.infer<typeof getCheckoutSessionIntentStatusOutput>
}) {
  const { checkoutSession } = intentStatus
  if (checkoutSession.status === CheckoutSessionStatus.Succeeded) {
    const successUrl = successUrlForCheckoutSession(checkoutSession)
    redirect(successUrl)
  } else if (
    checkoutSession.status === CheckoutSessionStatus.Failed
  ) {
    const failureUrl = failureUrlForCheckoutSession(checkoutSession)
    redirect(failureUrl)
  }
  return <div>Checkout session status: {checkoutSession.status}</div>
}

function PaymentIntentStatusPage({
  input,
  intentStatus,
}: {
  input: GetIntentStatusInput
  intentStatus: z.infer<typeof getPaymentIntentIntentStatusOutput>
}) {
  const { checkoutSession } = intentStatus
  return <div>Payment intent status: {checkoutSession.status}</div>
}

function SetupIntentStatusPage({
  input,
  intentStatus,
}: {
  input: GetIntentStatusInput
  intentStatus: z.infer<typeof getSetupIntentIntentStatusOutput>
}) {
  return <div>Setup intent status: {intentStatus.status}</div>
}

function VerifyCheckoutPage() {
  const searchParams = useSearchParams()

  const [error, setError] = useState<string | null>(null)
  const intentStatusInput = getIntentStatusInput(searchParams)
  const { data: intentStatus, refetch } =
    trpc.checkoutSessions.getIntentStatus.useQuery(intentStatusInput)
  useEffect(() => {
    const fetchIntentStatus = async () => {
      try {
        await refetch()
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unknown error occurred'
        )
      }
    }

    // Initial fetch
    fetchIntentStatus()

    // Set up polling interval
    const intervalId = setInterval(fetchIntentStatus, 5000)

    // Clean up interval on component unmount
    return () => clearInterval(intervalId)
  }, [refetch])
  if (intentStatusInput.type === 'checkoutSession') {
    return (
      <CheckoutSessionStatusPage
        input={intentStatusInput}
        intentStatus={
          intentStatus as GetCheckoutSessionIntentStatusOutput
        }
      />
    )
  }
  if (intentStatusInput.type === 'paymentIntent') {
    return (
      <PaymentIntentStatusPage
        input={intentStatusInput}
        intentStatus={
          intentStatus as GetPaymentIntentIntentStatusOutput
        }
      />
    )
  }
  if (intentStatusInput.type === 'setupIntent') {
    return (
      <SetupIntentStatusPage
        input={intentStatusInput}
        intentStatus={
          intentStatus as GetSetupIntentIntentStatusOutput
        }
      />
    )
  }
}

export default VerifyCheckoutPage
