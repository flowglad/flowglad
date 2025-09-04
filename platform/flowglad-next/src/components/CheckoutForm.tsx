'use client'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import PaymentForm, { PaymentLoadingForm } from './PaymentForm'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

const CheckoutFormDisabled = () => {
  const router = useRouter()
  return (
    <div className="relative w-full h-full max-w-[420px] rounded-md">
      <div className="p-4">
        <PaymentLoadingForm disableAnimation />
      </div>
      <div className="absolute top-0 left-0 right-0 bottom-0 backdrop-blur-sm rounded-md mb-20">
        <div className="flex flex-col gap-4 items-center justify-center h-full bg-[rgba(0,0,0,0.84)] rounded-md">
          <div className="flex flex-col gap-2 items-center justify-center bg-background-input p-4 rounded-md border border-muted">
            <TriangleAlert className="w-8 h-8" />
            <p className="text-lg font-semibold">
              Checkout is disabled
            </p>
            <p className="text-center text-sm text-muted-foreground font-medium m-auto max-w-[300px]">
              This is likely because the organization does not have
              payouts enabled.
            </p>
            <div className="flex flex-row gap-2 items-center justify-center">
              <Button
                onClick={() => {
                  router.push('/onboarding')
                }}
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
    <div className="flex flex-col gap-4 flex-1 h-full pt-8 pb-16 lg:pt-0 items-center lg:items-start">
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            disableAnimations: true,
            // theme: 'night',
            variables: {
              colorText: '#ffffff',
              colorBackground: '#353535',
              colorPrimary: '#ffffff',
              tabIconColor: '#d3d3d3',
              tabIconHoverColor: '#939393',
              colorTextSecondary: '#939393',
              borderRadius: '8px',
            },
            rules: {
              '.CodeInput': {
                border: '1px solid var(--colorBackground)',
                color: 'var(--colorText)',
                backgroundColor: '#1f1f1f',
              },
              '.Input': {
                border: '1px solid var(--colorBackground)',
                color: 'var(--colorText)',
              },
              '.Input:autofill': {
                color: '#000',
              },
              '.Block': {
                color: 'var(--colorText)',
              },
              '.Tab': {
                color: '#d3d3d3',
                border: '1px solid var(--colorBackground)',
              },
              '.Tab--selected': {
                color: 'var(--colorText)',
                border: '1px solid #ffffff24',
              },
              '.Tab:hover': {
                color: '#939393',
              },
              '.PickerItem': {
                color: '#d3d3d3',
                backgroundColor: 'var(--colorBackground)',
                border: '1px solid var(--colorBackground)',
              },
              '.PickerItem:hover': {
                color: '#939393',
                border: '1px solid #ffffff24',
                backgroundColor: 'var(--colorBackground)',
              },
              '.Label': {
                color: '#939393',
              },
              '.Dropdown': {
                color: 'var(--colorText)',
                border: '1px solid var(--colorBackground)',
                backgroundColor: '#ff0000',
              },
              '.DropdownItem': {
                color: 'var(--colorText)',
                border: '1px solid #ffffff24',
                backgroundColor: '#1f1f1f',
              },
              '.DropdownItem:hover': {
                color: 'var(--colorText)',
                backgroundColor: '#0f0f0f',
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
