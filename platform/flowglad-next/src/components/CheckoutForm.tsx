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
        <div className="flex flex-col gap-4 items-center justify-center h-full bg-background/95 backdrop-blur-sm rounded-md">
          <div className="flex flex-col gap-2 items-center justify-center bg-card p-4 rounded-md border border-border">
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
            variables: {
              colorText: 'hsl(var(--foreground))',
              colorBackground: 'hsl(var(--background))',
              colorPrimary: 'hsl(var(--primary))',
              tabIconColor: 'hsl(var(--muted-foreground))',
              tabIconHoverColor: 'hsl(var(--foreground))',
              colorTextSecondary: 'hsl(var(--muted-foreground))',
              borderRadius: '12px', // rounded-xl to match Input and Select components
            },
            rules: {
              '.Input, .CodeInput, .p-Input, .p-LinkAuth, .p-Input-input, .p-Fieldset-input':
                {
                  border: '1px solid hsl(var(--input)) !important',
                  color: 'hsl(var(--foreground)) !important',
                  backgroundColor:
                    'hsl(var(--background)) !important',
                  borderRadius: '12px !important', // rounded-xl
                },
              '.Input:focus, .CodeInput:focus, .p-Input:focus, .p-LinkAuth:focus, .p-Input-input:focus, .p-Fieldset-input:focus':
                {
                  borderColor: 'hsl(var(--foreground)) !important',
                  outline: 'none !important',
                  boxShadow:
                    '0 0 0 2px hsl(var(--foreground) / 0.2) !important',
                },
              '.Block': {
                color: 'hsl(var(--foreground))',
              },
              '.Tab, .p-Tab, .p-TabButton, .p-PaymentMethodSelector-tab':
                {
                  color: 'hsl(var(--muted-foreground)) !important',
                  border: '1px solid hsl(var(--input)) !important',
                  backgroundColor:
                    'hsl(var(--background)) !important',
                  borderRadius: '12px !important', // rounded-xl
                },
              '.Tab--selected, .p-Tab--selected, .p-TabButton--selected, .p-PaymentMethodSelector-tab--selected':
                {
                  color: 'hsl(var(--foreground)) !important',
                  border:
                    '1px solid hsl(var(--foreground)) !important',
                  backgroundColor:
                    'hsl(var(--background)) !important',
                  borderRadius: '12px !important', // rounded-xl
                },
              '.Tab:hover, .p-Tab:hover, .p-TabButton:hover, .p-PaymentMethodSelector-tab:hover':
                {
                  color: 'hsl(var(--foreground)) !important',
                  backgroundColor: 'hsl(var(--accent)) !important',
                  borderColor: 'hsl(var(--foreground)) !important',
                },
              '.PickerItem': {
                color: 'hsl(var(--muted-foreground))',
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--input))',
                borderRadius: '12px', // rounded-xl
              },
              '.PickerItem:hover': {
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--foreground))',
                backgroundColor: 'hsl(var(--accent))',
              },
              '.Label': {
                color: 'hsl(var(--muted-foreground))',
              },
              '.Dropdown': {
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--input))',
                backgroundColor: 'hsl(var(--popover))',
                borderRadius: '12px', // rounded-xl
                boxShadow:
                  'hsl(var(--foreground) / 0.1) 0px 4px 6px -1px, hsl(var(--foreground) / 0.1) 0px 2px 4px -2px',
              },
              '.DropdownItem': {
                color: 'hsl(var(--foreground))',
                backgroundColor: 'transparent',
                borderRadius: '8px', // rounded-lg for items
                border: 'none',
              },
              '.DropdownItem:hover': {
                color: 'hsl(var(--accent-foreground))',
                backgroundColor: 'hsl(var(--accent))',
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
