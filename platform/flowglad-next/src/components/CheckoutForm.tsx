'use client'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import PaymentForm, { PaymentLoadingForm } from './PaymentForm'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

const CheckoutFormDisabled = () => {
  const router = useRouter()
  return (
    <div className="relative w-full h-full sm:max-w-[420px] lg:max-w-[496px] rounded-md">
      <div className="p-4 lg:p-6">
        {' '}
        {/* Progressive padding */}
        <PaymentLoadingForm disableAnimation />
      </div>
      <div className="absolute top-0 left-0 right-0 bottom-0 backdrop-blur-sm rounded-md mb-20">
        <div className="flex flex-col gap-4 items-center justify-center h-full bg-background/95 backdrop-blur-sm rounded-md">
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
              // Fixed colors that work well on white background
              colorText: '#0a0a0a', // Always dark text
              colorBackground: '#ffffff', // Always white background
              colorPrimary: 'hsl(var(--primary))', // Keep primary color
              tabIconColor: '#6b7280', // Gray for icons
              tabIconHoverColor: '#0a0a0a', // Dark on hover
              colorTextSecondary: '#6b7280', // Gray for secondary text
              borderRadius: '8px', // Match LS border radius
            },
            rules: {
              // Enhanced styling for white background
              '.Input, .CodeInput, .p-Input, .p-LinkAuth, .p-Input-input, .p-Fieldset-input':
                {
                  border: '1px solid #e5e7eb !important', // Light gray border
                  color: '#0a0a0a !important', // Always dark text
                  backgroundColor: '#ffffff !important', // Always white background
                  borderRadius: '8px !important', // LS border radius
                  padding: '16px 16px !important', // LS field padding
                  fontSize: '14px !important', // LS font size
                  minHeight: '40px !important', // LS field height
                  boxShadow:
                    '0px 1px 1px 0px rgba(10,10,11,0.06) !important', // LS shadow
                },
              '.Input:focus, .CodeInput:focus, .p-Input:focus, .p-LinkAuth:focus, .p-Input-input:focus, .p-Fieldset-input:focus':
                {
                  borderColor: '#3b82f6 !important', // Blue focus border
                  outline: 'none !important',
                  boxShadow:
                    '0px 0px 0px 1px inset rgba(59,130,246,0.16) !important', // Blue focus shadow
                },
              '.Block': {
                color: '#0a0a0a', // Always dark text
              },
              '.Label': {
                color: '#0a0a0a', // Always dark text
                fontSize: '14px',
                fontWeight: '500', // LS label weight
                marginBottom: '8px', // LS label spacing
              },
              // Enhanced dropdown styling for white background
              '.Dropdown': {
                color: '#0a0a0a', // Always dark text
                border: '1px solid #e5e7eb', // Light gray border
                backgroundColor: '#ffffff', // Always white background
                borderRadius: '8px',
                boxShadow:
                  '0px 1px 1px 0px rgba(10,10,11,0.06), 0px 3px 6px 0px rgba(0,0,0,0.02)',
              },
              '.DropdownItem': {
                color: '#0a0a0a', // Always dark text
                backgroundColor: 'transparent',
                borderRadius: '6px',
                border: 'none',
                padding: '8px 12px',
              },
              '.DropdownItem:hover': {
                color: '#0a0a0a', // Keep dark text on hover
                backgroundColor: '#f3f4f6', // Light gray hover
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
