'use client'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import PaymentForm from './PaymentForm'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

const CheckoutFormDisabled = () => {
  const router = useRouter()
  return (
    <div className="relative w-full h-full sm:max-w-[420px] lg:max-w-[496px] rounded-md">
      <div className="flex flex-col gap-4 items-center justify-center h-full bg-background/95 backdrop-blur-sm rounded-md min-h-[400px]">
        <div className="flex flex-col gap-2 items-center justify-center bg-card p-6 lg:p-8 rounded-md border border-border w-full sm:max-w-[320px] lg:max-w-[400px]">
          <TriangleAlert className="w-8 h-8 text-destructive" />
          <p className="text-lg font-semibold text-center">
            Checkout is disabled
          </p>
          <p className="text-center text-sm text-muted-foreground font-medium">
            This is likely because the organization does not have
            payouts enabled.
          </p>
          <Button
            onClick={() => {
              router.push('/onboarding')
            }}
            className="mt-4 w-full lg:w-auto"
          >
            Enable Payouts
            <ChevronRight
              className="w-4 h-4 ml-2"
              size={16}
              strokeWidth={4}
            />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * https://docs.stripe.com/payments/accept-a-payment-deferred?platform=web&type=subscription#web-collect-payment-details
 * This is the flow:
 * - Collect payment details (PaymentElement)
 * - Gather e.g. address (AddressElement)
 * - Create customer (server side using above)
 * - Create subscription server side, basically run this flow: https://docs.stripe.com/payments/accept-a-payment-deferred?platform=web&type=subscription#create-intent
 * - Create subscription server side.
 * @param props
 * @returns
 */
function CheckoutForm() {
  const { clientSecret, checkoutSession } = useCheckoutPageContext()
  const livemode = checkoutSession.livemode

  /**
   * Calling loadStripe promise outside of render to avoid calling it every render.
   * Also, using `process.env` because this is client side,
   * and NEXT_PUBLIC env vars are hardcoded, inlined at build time.
   */
  const stripePromise = useMemo(
    () =>
      loadStripe(
        livemode
          ? (process.env.NEXT_PUBLIC_STRIPE_CLIENT_KEY as string)
          : (process.env
              .NEXT_PUBLIC_STRIPE_TEST_MODE_CLIENT_KEY as string)
      ),
    [livemode]
  )
  if (!clientSecret) {
    return <CheckoutFormDisabled />
  }
  return (
    <div
      className={cn(
        'w-full h-full',
        'flex flex-col gap-6', // Consistent spacing like LS
        'pt-0 pb-0', // Remove default padding
        'items-stretch lg:items-start' // Full width on mobile
      )}
    >
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            disableAnimations: true,
            variables: {
              // VALID Stripe appearance variables - optimized for consistent input heights
              colorText: '#0a0a0a',
              colorBackground: '#ffffff',
              colorPrimary: '#0a0a0a',
              colorTextSecondary: '#6b7280',
              borderRadius: '8px',
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSizeBase: '14px',
              fontLineHeight: '1.3',
              // Height and spacing controls to match discount input (42.09px target)
              spacingUnit: '4px', // Controls internal spacing throughout Elements to match updated discount input
              gridColumnSpacing: '16px', // Controls horizontal spacing
              gridRowSpacing: '16px', // Increased spacing between tab selector and input fields
            },
            rules: {
              // Minimal rules - let Stripe variables control styling for consistency
              '.Input': {
                border: '1px solid #e5e7eb',
                // height, padding, fontSize, etc. controlled by variables above
              },
              '.Label': {
                fontWeight: '500',
                // fontSize and spacing controlled by variables above
              },
            },
          },
        }}
      >
        <PaymentForm />
      </Elements>
    </div>
  )
}

export default CheckoutForm
