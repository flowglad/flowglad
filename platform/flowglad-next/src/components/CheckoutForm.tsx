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
              // === COLOR VARIABLES ===
              // Currently using:
              colorText: '#0a0a0a', // Primary text color
              colorBackground: '#ffffff', // Background color (CRITICAL for autocomplete)
              colorPrimary: '#0a0a0a', // Primary brand color (buttons, focus states)
              colorTextSecondary: '#6b7280', // Secondary text color

              // Available color options:
              // colorDanger: '#dc2626',               // Error states, destructive actions
              // colorSuccess: '#059669',              // Success states, confirmations
              // colorWarning: '#d97706',              // Warning states, cautions
              // colorTextPlaceholder: '#9ca3af',      // Placeholder text color

              // === ICON COLOR VARIABLES ===
              // Available icon color options:
              // iconColor: '#6b7280',                 // Default icon color
              // iconHoverColor: '#374151',            // Icon color on hover
              // iconCardErrorColor: '#dc2626',        // Card icons in error states
              // iconCardCvcColor: '#6b7280',          // CVC card icons
              // iconCardCvcErrorColor: '#dc2626',     // CVC card icons in error
              // iconCheckmarkColor: '#059669',        // Checkmark icons
              // iconChevronDownColor: '#6b7280',      // Dropdown arrows
              // iconChevronDownHoverColor: '#374151', // Dropdown arrows on hover
              // iconCloseColor: '#6b7280',            // Close/X icons
              // iconCloseHoverColor: '#374151',       // Close icons on hover
              // iconLoadingIndicatorColor: '#3b82f6', // Loading spinners
              // iconRedirectColor: '#6b7280',         // Redirect icons
              // tabIconColor: '#6b7280',              // Tab icons
              // tabIconHoverColor: '#374151',         // Tab icons on hover
              // tabIconSelectedColor: '#0a0a0a',      // Selected tab icons
              // tabIconMoreColor: '#6b7280',          // "More" menu icon
              // tabIconMoreHoverColor: '#374151',     // "More" menu icon on hover

              // === ACCESSIBILITY COLOR VARIABLES ===
              // Available accessibility color options:
              // accessibleColorOnColorPrimary: '#ffffff',    // Text on primary color
              // accessibleColorOnColorBackground: '#0a0a0a', // Text on background
              // accessibleColorOnColorSuccess: '#ffffff',    // Text on success color
              // accessibleColorOnColorDanger: '#ffffff',     // Text on danger color
              // accessibleColorOnColorWarning: '#000000',    // Text on warning color

              // === LOGO COLOR VARIABLES ===
              // Available logo color options:
              // logoColor: 'dark',                    // Logo variant: 'light' or 'dark'
              // tabLogoColor: 'dark',                 // Logo in tabs
              // tabLogoSelectedColor: 'dark',         // Logo in selected tabs
              // blockLogoColor: 'dark',               // Logo in block components

              // === TYPOGRAPHY VARIABLES ===
              // Currently using:
              fontFamily:
                'SF Pro, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSizeBase: '14px', // Base font size for all text
              fontLineHeight: '1.3', // Line height multiplier

              // Available typography options:
              // fontSizeSm: '12px',                   // Small text (labels, captions)
              // fontSizeLg: '16px',                   // Large text (headings)
              // fontSizeXl: '18px',                   // Extra large text
              // fontSizeXs: '11px',                   // Extra small text
              // fontSize2Xs: '10px',                  // Double extra small text
              // fontSize3Xs: '9px',                   // Triple extra small text
              // fontWeightLight: '300',               // Light font weight
              // fontWeightNormal: '400',              // Normal font weight
              // fontWeightMedium: '500',              // Medium font weight
              // fontWeightBold: '600',                // Bold font weight
              // fontSmooth: 'always',                 // Text anti-aliasing: 'always', 'auto', 'never'
              // fontVariantLigatures: 'normal',       // Font ligatures control
              // fontVariationSettings: 'normal',      // Variable font settings

              // === BORDER & SHAPE VARIABLES ===
              // Currently using:
              borderRadius: '8px', // Border radius for all elements

              // Available border/shape options:
              // borderWidth: '1px',                   // Border width for inputs
              // focusBoxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5)', // Focus ring shadow
              // focusOutline: 'none',                 // Focus outline style

              // === SPACING VARIABLES ===
              // Currently using:
              spacingUnit: '4px', // Base spacing unit (internal padding/margins)
              gridColumnSpacing: '8px', // Horizontal spacing between columns
              gridRowSpacing: '16px', // Vertical spacing between elements

              // Available spacing options:
              // spacingGridRow: '20px',               // Alternative to gridRowSpacing
              // spacingGridColumn: '12px',            // Alternative to gridColumnSpacing
              // tabSpacing: '10px',                   // Horizontal spacing between tabs
              // accordionItemSpacing: '12px',         // Vertical spacing between accordion items
              // pickerItemSpacing: '8px',             // Spacing between picker items

              // === SIZE VARIABLES ===
              // Available size options (not currently using any):
              // borderWidth: '1px',                   // Border thickness
              // controlHeight: '40px',                // Height of form controls

              // === ACCESSIBILITY VARIABLES ===
              // Available accessibility options (not currently using any):
              // accessibilityOutline: '2px solid #0066cc', // High contrast outline
              // accessibilityOutlineOffset: '2px',    // Outline offset for focus

              // === ADVANCED CUSTOMIZATION ===
              // Available advanced options (use with caution):
              // logoAlignment: 'left',                // Logo position in payment methods
              // buttonHeight: '44px',                 // Custom button height
              // inputHeight: '44px',                  // Custom input height
            },
            rules: {
              // Minimal rules - let Stripe variables control styling for consistency
              '.Input': {
                border: '1px solid #e5e5e5',
                // height, padding, fontSize, etc. controlled by variables above
              },
              '.Label': {
                fontWeight: '500',
                textTransform: 'capitalize',
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
