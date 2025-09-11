# Lemon Squeezy Checkout Implementation Guide

This guide provides exact implementation steps to transform your current checkout page to match Lemon Squeezy's design patterns while maintaining your existing payment methods and adding proper light/dark mode support.

## 📋 Implementation Overview

### Goals
- ✅ Responsive layout matching LS breakpoint strategy (1536px, 768px, 390px)
- ✅ Progressive spacing system with proper padding/margins
- ✅ Shadcn color variables for light/dark mode adaptation
- ✅ Keep current Stripe payment methods (no tabs)
- ✅ Mobile-first approach with touch optimization
- ✅ Visual hierarchy improvements

### Breakpoint Strategy
- **Desktop (1536px+)**: 768px + 768px split layout
- **Tablet (768px)**: 384px + 384px stacked layout  
- **Mobile (390px)**: Single column 390px flow

---

## Phase 1: Layout Foundation Updates

### 1.1 Update CheckoutPage.tsx Main Container

**File:** `platform/flowglad-next/src/components/CheckoutPage.tsx`

Replace the current container styling:

```tsx
const CheckoutPage = ({
  checkoutInfo,
}: {
  checkoutInfo: CheckoutInfoCore
}) => {
  if (checkoutInfo.flowType === CheckoutFlowType.Invoice) {
    throw Error(
      'Invoice checkout flow cannot be rendered as a Checkout Page'
    )
  }
  useSetCheckoutSessionCookieEffect(checkoutInfo)

  /** Background split overlay for left side - Dark theme adaptive */
  const leftBackgroundOverlay = cn(
    'absolute top-0 left-0 bottom-0',
    'right-[50%] lg:right-[50%]',           // Split at 50% on desktop
    'right-0 md:right-0 lg:right-[50%]',   // Full width on mobile/tablet
    'bg-muted dark:bg-[#141414]',          // Adaptive background
    '-z-10',
    'hidden lg:block'                      // Only show split on desktop
  )

  /** Background split overlay for right side */
  const rightBackgroundOverlay = cn(
    'absolute top-0 bottom-0',
    'left-[50%] right-0',                  // Right half on desktop
    'bg-background',                       // White/dark adaptive
    '-z-10 hidden lg:block'
  )

  /** Main container with Lemon Squeezy responsive approach */
  const checkoutContainer = cn(
    'bg-transparent min-h-screen',
    'flex flex-col lg:flex-row',           // Stack on mobile, side-by-side on desktop
    'relative z-10'
  )

  /** Product section (left side) */
  const productSectionContainer = cn(
    'w-full lg:w-[768px]',                 // Full width mobile, 768px desktop
    'bg-muted dark:bg-[#141414]',          // Adaptive dark background
    'lg:min-h-screen',                     // Full height on desktop
    'px-8 lg:px-40',                       // 32px mobile, 160px desktop (like LS)
    'pt-12 sm:pt-12 lg:pt-[120px]',       // 48px mobile, 120px desktop
    'pb-12 lg:pb-[643.55px]',             // Progressive bottom padding
    'flex flex-col'
  )

  /** Form section (right side) */
  const formSectionContainer = cn(
    'w-full lg:w-[768px]',                 // Full width mobile, 768px desktop
    'bg-background',                       // White/dark adaptive
    'lg:min-h-screen',                     // Full height on desktop
    'px-8 lg:px-[136px]',                 // 32px mobile, 136px desktop (like LS)
    'pt-12 lg:pt-[120px]',                // Match product section
    'pb-20',                               // Bottom padding
    'flex flex-col'
  )

  return (
    <CheckoutPageProvider values={checkoutInfo}>
      <div className={leftBackgroundOverlay} />
      <div className={rightBackgroundOverlay} />
      
      <div className={checkoutContainer}>
        {/* Product Details Section */}
        <div className={productSectionContainer}>
          <div className="max-w-[448px] lg:max-w-[448px] w-full">
            <CheckoutDetails />
          </div>
        </div>

        {/* Payment Form Section */}
        <div className={formSectionContainer}>
          <div className="max-w-[496px] w-full lg:max-w-[496px]">
            <CheckoutForm />
          </div>
        </div>
      </div>
    </CheckoutPageProvider>
  )
}
```

### 1.2 Update CheckoutDetails.tsx for Product Section

**File:** `platform/flowglad-next/src/components/checkout/checkout-details.tsx`

```tsx
'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { BillingHeader } from './billing-header'
import { SellerInfo } from './seller-info'

interface CheckoutDetailsProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const CheckoutDetails = React.forwardRef<
  HTMLDivElement,
  CheckoutDetailsProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'relative w-full h-full',
        'flex flex-col gap-6',              // Consistent gap like LS
        className
      )}
      {...props}
    >
      {/* Seller Info - positioned like LS header */}
      <div className="relative">
        <SellerInfo 
          data-testid="seller-info"
          className={cn(
            'flex items-center gap-3',
            'text-foreground dark:text-white',  // Adaptive text color
            'mb-8 lg:mb-0',                     // Spacing adjustment
            'lg:absolute lg:top-0 lg:left-0'   // Position like LS
          )}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-6 pt-16 lg:pt-24">
        <BillingHeader 
          data-testid="billing-header"
          className="w-full"
        />
        
        {/* Product Showcase Area (like LS image carousel) */}
        <div className={cn(
          'w-full rounded-[8px] overflow-hidden',
          'bg-card dark:bg-card/10',         // Subtle card background
          'border border-border/50',
          'min-h-[240px] lg:min-h-[336px]', // Responsive height like LS
          'flex items-center justify-center',
          'mb-6'
        )}>
          <div className="text-muted-foreground text-sm">
            {/* This is where product images/carousel would go */}
            Product Preview Area
          </div>
        </div>

        {/* Product Description Section */}
        <div className={cn(
          'space-y-6',
          'text-foreground dark:text-[#cccccc]',  // LS text color
          'text-[14px] leading-[24px]'            // LS typography
        )}>
          {/* Additional product details can be added here */}
        </div>
      </div>
    </div>
  )
})

CheckoutDetails.displayName = 'CheckoutDetails'
```

---

## Phase 2: Form Layout & Spacing Updates

### 2.1 Update CheckoutForm.tsx Container

**File:** `platform/flowglad-next/src/components/CheckoutForm.tsx`

```tsx
function CheckoutForm() {
  const { clientSecret, checkoutSession } = useCheckoutPageContext()
  const livemode = checkoutSession.livemode

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
    <div className={cn(
      'w-full h-full',
      'flex flex-col gap-6',              // Consistent spacing like LS
      'pt-0 pb-0',                        // Remove default padding
      'items-stretch lg:items-start'      // Full width on mobile
    )}>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            disableAnimations: true,
            variables: {
              // Use CSS custom properties for theming
              colorText: 'hsl(var(--foreground))',
              colorBackground: 'hsl(var(--background))',
              colorPrimary: 'hsl(var(--primary))',
              tabIconColor: 'hsl(var(--muted-foreground))',
              tabIconHoverColor: 'hsl(var(--foreground))',
              colorTextSecondary: 'hsl(var(--muted-foreground))',
              borderRadius: '8px',        // Match LS border radius
            },
            rules: {
              // Enhanced styling to match LS form fields
              '.Input, .CodeInput, .p-Input, .p-LinkAuth, .p-Input-input, .p-Fieldset-input':
                {
                  border: '1px solid hsl(var(--border)) !important',
                  color: 'hsl(var(--foreground)) !important',
                  backgroundColor: 'hsl(var(--background)) !important',
                  borderRadius: '8px !important',           // LS border radius
                  padding: '16px 16px !important',          // LS field padding
                  fontSize: '14px !important',              // LS font size
                  minHeight: '40px !important',             // LS field height
                  boxShadow: '0px 1px 1px 0px rgba(10,10,11,0.06) !important', // LS shadow
                },
              '.Input:focus, .CodeInput:focus, .p-Input:focus, .p-LinkAuth:focus, .p-Input-input:focus, .p-Fieldset-input:focus':
                {
                  borderColor: 'hsl(var(--ring)) !important',
                  outline: 'none !important',
                  boxShadow: '0px 0px 0px 1px inset rgba(10,10,46,0.16) !important', // LS focus state
                },
              '.Block': {
                color: 'hsl(var(--foreground))',
              },
              '.Label': {
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                fontWeight: '500',                          // LS label weight
                marginBottom: '8px',                       // LS label spacing
              },
              // Enhanced dropdown styling
              '.Dropdown': {
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--popover))',
                borderRadius: '8px',
                boxShadow: '0px 1px 1px 0px rgba(10,10,11,0.06), 0px 3px 6px 0px rgba(0,0,0,0.02)',
              },
              '.DropdownItem': {
                color: 'hsl(var(--foreground))',
                backgroundColor: 'transparent',
                borderRadius: '6px',
                border: 'none',
                padding: '8px 12px',
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
```

### 2.2 Update PaymentForm.tsx Layout

**File:** `platform/flowglad-next/src/components/PaymentForm.tsx`

Replace the form container and layout:

```tsx
// Update the form className and structure
return (
  <form
    className={cn(
      'w-full relative',                    // Remove fixed width
      'flex flex-col gap-5',               // LS gap pattern
      'max-w-[496px]'                      // LS form max-width
    )}
    onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      // ... existing submit logic
    }}
  >
    {/* Loading overlay */}
    {
      <div
        className={cn(
          'absolute inset-0 z-10 transition-opacity duration-300 rounded-[8px]',
          embedsReady
            ? 'opacity-0 pointer-events-none'
            : 'opacity-100',
          'bg-background/95 backdrop-blur-sm'
        )}
      >
        <PaymentLoadingForm />
      </div>
    }

    {/* Main form content */}
    <div
      className={cn(
        'transition-opacity duration-300 space-y-5',  // LS spacing pattern
        !embedsReady && 'opacity-0'
      )}
    >
      {/* Email Section */}
      <div className="space-y-3">                     {/* LS label spacing */}
        <AuthenticationElement
          readonlyCustomerEmail={readonlyCustomerEmail}
          onChange={async (event) => {
            // ... existing logic
          }}
          onReady={() => {
            setEmailEmbedReady(true)
          }}
          className={cn('w-full', !embedsReady && 'opacity-0')}
        />
        {emailError && (
          <ErrorLabel error={emailError} className="mt-2" />
        )}
      </div>

      {/* Payment Method Section */}
      <div className="space-y-3">
        <PaymentElement
          onReady={() => {
            setPaymentEmbedReady(true)
          }}
          options={{
            fields: {
              billingDetails: {
                email: readonlyCustomerEmail ? 'never' : undefined,
                address: 'never',
              },
            },
          }}
          onChange={async (e) => {
            // ... existing logic
          }}
          className={!embedsReady ? 'opacity-0' : ''}
        />
      </div>

      {/* Billing Address Section */}
      <div className="space-y-3">
        <AddressElement
          options={{
            mode: 'billing',
            defaultValues:
              checkoutSession?.billingAddress ?? undefined,
          }}
          onReady={() => {
            setAddressEmbedReady(true)
          }}
          onChange={async (event) => {
            // ... existing logic
          }}
          className={!embedsReady ? 'opacity-0' : ''}
        />
      </div>
    </div>

    {/* Form Footer - Order Summary & Actions */}
    {embedsReady && (
      <div className="space-y-6 pt-1">                {/* LS spacing */}
        {/* Discount Code */}
        {showDiscountCodeInput && (
          <div className="space-y-3">
            <DiscountCodeInput />
          </div>
        )}

        {/* Order Summary */}
        <div className="space-y-4">
          <TotalBillingDetails />
        </div>

        {/* Auto Update Subscriptions */}
        {showAutomaticallyUpdateCurrentSubscriptions && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-update-subscriptions"
                checked={
                  checkoutSession.automaticallyUpdateSubscriptions ??
                  false
                }
                onCheckedChange={async (checked) => {
                  await editCheckoutSessionAutomaticallyUpdateSubscriptions(
                    {
                      id: checkoutSession.id,
                      automaticallyUpdateSubscriptions: checked,
                    }
                  )
                }}
              />
              <Label
                htmlFor="auto-update-subscriptions"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Set as default method for existing subscriptions
              </Label>
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="pt-2">                       {/* LS button spacing */}
          <Button
            className={cn(
              'w-full h-[52px]',                     // LS button height
              'bg-[#f5e901] hover:bg-[#f5e901]/90', // LS button color
              'text-black font-normal',              // LS button text
              'rounded-[8px]',                       // LS border radius
              'text-[16px] leading-[28px]',          // LS typography
              'disabled:opacity-50'                  // LS disabled state
            )}
            disabled={
              !paymentInfoComplete ||
              !emailComplete ||
              isSubmitting ||
              checkoutBlocked
            }
          >
            {isSubmitting && (
              <LoaderCircle
                className="animate-spin-slow w-4 h-4 mr-2"
                size={16}
              />
            )}
            {buttonLabel}
          </Button>
          
          {errorMessage && (
            <ErrorLabel error={errorMessage} className="mt-3" />
          )}
          
          {!checkoutSession.livemode && (
            <div className="p-4 bg-yellow-500 dark:bg-yellow-600 justify-center items-center text-center w-full flex mt-4 rounded-md">
              <div className="text-white dark:text-black text-sm">
                <p>This is a test mode checkout.</p>
                <p>No payments will be processed.</p>
              </div>
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className={cn(
          'bg-muted/50 border border-border/50',     // Subtle background
          'rounded-[8px] p-4',
          'flex items-center justify-center gap-2'
        )}>
          <div className="w-6 h-6 text-muted-foreground">
            {/* Security icon */}
            <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="text-[13px] text-muted-foreground leading-[24px]">
            Payments are secure and encrypted
          </span>
        </div>

        {/* Footer Links */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <PoweredByFlowglad />
          
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <a href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </a>
            <span>·</span>
            <a href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <span>·</span>
            <a href="/help" className="hover:text-foreground transition-colors">
              Help
            </a>
          </div>
        </div>
      </div>
    )}
  </form>
)
```

---

## Phase 3: Enhanced Visual Components

### 3.1 Update BillingHeader.tsx for Better Product Display

**File:** `platform/flowglad-next/src/components/checkout/billing-header.tsx`

```tsx
export const BillingHeader = React.forwardRef<
  HTMLDivElement,
  BillingHeaderProps
>(({ className, ...props }, ref) => {
  const checkoutPageContext = useCheckoutPageContext()

  if (
    checkoutPageContext.flowType === CheckoutFlowType.Invoice ||
    checkoutPageContext.flowType === CheckoutFlowType.AddPaymentMethod
  ) {
    return null
  }

  const {
    purchase,
    price,
    product,
    subscriptionDetails,
    flowType,
    checkoutSession,
  } = checkoutPageContext

  let mainTitleSuffix = ''
  if (price.type === PriceType.SinglePayment) {
    mainTitleSuffix = `${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      purchase?.firstInvoiceValue == null
        ? price.unitPrice * checkoutSession.quantity
        : purchase.firstInvoiceValue
    )}`
  } else if (flowType === CheckoutFlowType.Subscription) {
    mainTitleSuffix = pricingSubtitleForSubscriptionFlow(
      checkoutPageContext
    )
  }

  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-4', className)}  // Better spacing
      {...props}
    >
      {/* Product Title & Price Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className={cn(
            'text-[24px] font-medium leading-[32px]',  // LS typography
            'text-foreground dark:text-white',          // Adaptive color
            'mb-1'
          )}>
            {product.name}
          </h1>
          {mainTitleSuffix && (
            <p className="text-[20px] leading-[30px] text-muted-foreground dark:text-gray-400">
              {mainTitleSuffix}
            </p>
          )}
        </div>
      </div>

      {/* Product Description */}
      {product.description && (
        <div className={cn(
          'text-[14px] leading-[24px]',               // LS typography
          'text-foreground dark:text-[#cccccc]',      // LS description color
          'space-y-4'
        )}>
          <CheckoutMarkdownView
            data-testid="product-description"
            source={product.description}
            className="prose prose-sm dark:prose-invert"
          />
        </div>
      )}
    </div>
  )
})
```

### 3.2 Update SellerInfo.tsx for Better Header

**File:** `platform/flowglad-next/src/components/checkout/seller-info.tsx`

```tsx
export const SellerInfo = React.forwardRef<
  HTMLDivElement,
  SellerInfoProps
>(({ className, ...props }, ref) => {
  const { sellerOrganization } = useCheckoutPageContext()
  
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3',
        'h-auto',                                      // Remove fixed height
        className
      )}
      {...props}
    >
      {sellerOrganization.logoURL && (
        <div className={cn(
          'bg-background border border-border/50',     // Adaptive background
          'h-6 w-6 flex justify-center items-center',  // LS size
          'rounded-full shadow-sm'                     // Subtle shadow
        )}>
          <Image
            src={sellerOrganization.logoURL ?? ''}
            alt={sellerOrganization.name}
            className="h-6 w-6 rounded-full object-cover"
            width={24}
            height={24}
          />
        </div>
      )}
      <span className={cn(
        'text-[14px] font-medium',                     // LS typography
        'text-foreground dark:text-white'              // Adaptive color
      )}>
        {sellerOrganization.name}
      </span>
    </div>
  )
})
```

---

## Phase 4: Responsive Behavior & Mobile Optimization

### 4.1 Add Mobile-Specific Improvements

Create a new file for mobile-specific utilities:

**File:** `platform/flowglad-next/src/components/checkout/mobile-optimizations.tsx`

```tsx
'use client'

import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

// Hook to detect mobile viewport
export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

// Mobile-optimized container component
export const MobileOptimizedContainer = ({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) => {
  const isMobile = useIsMobile()
  
  return (
    <div className={cn(
      // Progressive container widths matching LS
      'w-full',
      'max-w-[390px] sm:max-w-[768px] lg:max-w-[1536px]',
      'mx-auto',
      className
    )}>
      {children}
    </div>
  )
}

// Touch-optimized form field wrapper
export const TouchOptimizedField = ({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) => {
  return (
    <div className={cn(
      'min-h-[44px]',                                 // iOS minimum touch target
      'relative',
      className
    )}>
      {children}
    </div>
  )
}
```

### 4.2 Update CheckoutFormDisabled for Better Mobile Experience

Update the disabled state component:

```tsx
const CheckoutFormDisabled = () => {
  const router = useRouter()
  return (
    <div className="relative w-full h-full max-w-[420px] lg:max-w-[496px] rounded-md">
      <div className="p-4 lg:p-6">                   {/* Progressive padding */}
        <PaymentLoadingForm disableAnimation />
      </div>
      <div className="absolute top-0 left-0 right-0 bottom-0 backdrop-blur-sm rounded-md mb-20">
        <div className="flex flex-col gap-4 items-center justify-center h-full bg-background/95 backdrop-blur-sm rounded-md">
          <div className="flex flex-col gap-2 items-center justify-center bg-card p-6 lg:p-8 rounded-md border border-border max-w-[320px] lg:max-w-[400px]">
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
              className="mt-4 w-full lg:w-auto"        {/* Full width on mobile */}
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
```

---

## Phase 5: Testing & Validation

### 5.1 Responsive Testing Checklist

Create a testing checklist to ensure proper implementation:

```markdown
## Testing Checklist

### Desktop (1536px+)
- [ ] Split layout: 768px product section + 768px form section
- [ ] Product section: 160px horizontal padding, 120px top padding
- [ ] Form section: 136px horizontal padding, 120px top padding
- [ ] Form max-width: 496px
- [ ] Dark/light theme adaptation works
- [ ] All spacing matches LS patterns

### Tablet (768px)
- [ ] Stacked layout: product section above form section
- [ ] Both sections: 32px horizontal padding, 120px top padding
- [ ] Form max-width: 380px
- [ ] Proper vertical spacing between sections
- [ ] Touch targets minimum 44px height

### Mobile (390px)
- [ ] Single column layout
- [ ] 32px horizontal padding throughout
- [ ] 48px top padding for form section
- [ ] Form max-width: 326px
- [ ] All interactive elements easily touchable
- [ ] Text remains readable at small sizes
- [ ] Buttons full-width on mobile

### Cross-Platform
- [ ] Smooth transitions between breakpoints
- [ ] No horizontal scrolling at any width
- [ ] Form validation works consistently
- [ ] Loading states display properly
- [ ] Error messages are visible and accessible
- [ ] Payment flow completes successfully
```

### 5.2 Color Theme Validation

Ensure proper Shadcn color variables are used throughout:

```tsx
// Color mapping reference for validation
const colorMapping = {
  // LS Dark Product Section → Shadcn
  '#141414': 'hsl(var(--muted)) dark:bg-[#141414]',
  
  // LS Text Colors → Shadcn
  'white': 'hsl(var(--foreground))',
  '#cccccc': 'hsl(var(--muted-foreground))',
  '#8e68ff': 'hsl(var(--primary))',
  'grey': 'hsl(var(--muted-foreground))',
  
  // LS Form Colors → Shadcn
  '#f7f7f8': 'hsl(var(--muted))',
  '#25252d': 'hsl(var(--foreground))',
  '#6c6c84': 'hsl(var(--muted-foreground))',
  '#e6e6e6': 'hsl(var(--border))',
  
  // LS Button → Shadcn (keep LS yellow for brand)
  '#f5e901': '#f5e901', // Keep original LS yellow
}
```

---

## Implementation Order

### Week 1: Foundation
1. ✅ Update `CheckoutPage.tsx` main container
2. ✅ Update responsive breakpoints and spacing
3. ✅ Add Shadcn color variables

### Week 2: Form Layout
1. ✅ Update `CheckoutForm.tsx` container
2. ✅ Update `PaymentForm.tsx` spacing and layout
3. ✅ Enhance Stripe element styling

### Week 3: Visual Polish
1. ✅ Update `BillingHeader.tsx` styling
2. ✅ Update `SellerInfo.tsx` styling
3. ✅ Add security notice and footer links

### Week 4: Mobile & Testing
1. ✅ Add mobile optimizations
2. ✅ Complete responsive testing
3. ✅ Theme validation and final polish

---

## Expected Results

After implementation, your checkout page will have:

✅ **Lemon Squeezy-inspired responsive behavior**
- Progressive layout evolution (1536px → 768px → 390px)
- Proper spacing system matching LS patterns
- Mobile-first approach with touch optimization

✅ **Enhanced visual hierarchy**
- Adaptive dark/light product section using Shadcn variables
- Clean form section with LS-inspired spacing
- Professional typography and color system

✅ **Maintained functionality**
- All existing Stripe payment methods preserved
- Current payment flow unchanged
- Existing form validation and error handling

✅ **Improved user experience**
- Better mobile responsiveness
- Cleaner visual design
- Professional checkout appearance matching modern standards

This implementation guide provides exact code changes needed to transform your checkout page while maintaining your existing payment infrastructure and adding proper theming support.
