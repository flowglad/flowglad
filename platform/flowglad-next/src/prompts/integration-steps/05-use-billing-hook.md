# Step 5: Using the useBilling Hook

## Objective

Access billing data and functions in your React components using the `useBilling` hook.

## Overview

The `useBilling` hook provides:
- Customer and subscription data
- Feature access checking
- Usage balance checking
- Checkout session creation
- Subscription management
- Loading and error states

## Basic Usage

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs' // or '@flowglad/react'

export function BillingComponent() {
  const billing = useBilling()
  
  // Destructure what you need
  const { 
    loaded,
    loadBilling,
    errors,
    customer,
    subscriptions,
    checkFeatureAccess,
    checkUsageBalance,
    createCheckoutSession,
    reload,
  } = billing
  
  // Always check loading state first
  if (!loadBilling) {
    return <div>Not authenticated</div>
  }
  
  if (!loaded) {
    return <div>Loading billing...</div>
  }
  
  if (errors?.length) {
    return <div>Error: {errors[0].message}</div>
  }
  
  return (
    <div>
      <p>Welcome, {customer?.name}</p>
    </div>
  )
}
```

## Available Data & Functions

### Loading State

```typescript
const { loaded, loadBilling, errors, reload } = useBilling()

// loaded: boolean - true when billing data has settled
// loadBilling: boolean - mirrors provider prop
// errors: Error[] | null - errors from last fetch
// reload: () => Promise<void> - refetch billing data
```

### Customer Data

```typescript
const { customer, subscriptions, invoices, paymentMethods } = useBilling()

// customer: Customer | null
// subscriptions: Subscription[]
// invoices: Invoice[]
// paymentMethods: PaymentMethod[]
```

### Feature Access

```typescript
const { checkFeatureAccess } = useBilling()

// Check if user has access to a feature
const hasPremium = checkFeatureAccess('premium_feature')
const hasAdvancedAnalytics = checkFeatureAccess('advanced_analytics')
```

### Usage Balance

```typescript
const { checkUsageBalance } = useBilling()

// Get remaining balance for a usage meter
const apiUsage = checkUsageBalance('api_calls')
// Returns: { availableBalance: number } | null

if (apiUsage) {
  console.log(`${apiUsage.availableBalance} API calls remaining`)
}
```

### Product & Price Lookup

```typescript
const { getProduct, getPrice } = useBilling()

// Look up a product by slug
const proPlan = getProduct('pro')

// Look up a price by slug
const monthlyPrice = getPrice('pro-monthly')
```

### Checkout Sessions

```typescript
const { createCheckoutSession } = useBilling()

// Create a checkout for a subscription or one-time payment
await createCheckoutSession({
  priceSlug: 'pro-monthly', // or priceId
  successUrl: `${window.location.origin}/success`,
  cancelUrl: `${window.location.origin}/pricing`,
  autoRedirect: true, // automatically redirect to checkout
  quantity: 1,
})
```

### Subscription Management

```typescript
const { cancelSubscription } = useBilling()

// Cancel a subscription
await cancelSubscription({
  id: 'sub_123',
  cancellation: {
    timing: 'at_end_of_current_billing_period',
  },
})
```

## Common Patterns

### Feature Gate Component

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

interface FeatureGateProps {
  featureSlug: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function FeatureGate({ 
  featureSlug, 
  children, 
  fallback = <UpgradePrompt /> 
}: FeatureGateProps) {
  const { loaded, checkFeatureAccess } = useBilling()
  
  if (!loaded || !checkFeatureAccess) {
    return null // or loading spinner
  }
  
  if (!checkFeatureAccess(featureSlug)) {
    return <>{fallback}</>
  }
  
  return <>{children}</>
}

// Usage
<FeatureGate featureSlug="advanced_analytics">
  <AdvancedAnalyticsDashboard />
</FeatureGate>
```

### Upgrade Button

```tsx
'use client'

import { useState } from 'react'
import { useBilling } from '@flowglad/nextjs'

export function UpgradeButton({ priceSlug }: { priceSlug: string }) {
  const { createCheckoutSession } = useBilling()
  const [isLoading, setIsLoading] = useState(false)
  
  const handleUpgrade = async () => {
    setIsLoading(true)
    try {
      await createCheckoutSession({
        priceSlug,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      })
    } catch (error) {
      console.error('Checkout failed:', error)
      setIsLoading(false)
    }
  }
  
  return (
    <button onClick={handleUpgrade} disabled={isLoading}>
      {isLoading ? 'Loading...' : 'Upgrade'}
    </button>
  )
}
```

### Usage Meter Display

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function UsageMeter({ slug }: { slug: string }) {
  const { loaded, checkUsageBalance } = useBilling()
  
  if (!loaded || !checkUsageBalance) {
    return <div>Loading...</div>
  }
  
  const usage = checkUsageBalance(slug)
  
  if (!usage) {
    return <div>No usage meter found</div>
  }
  
  return (
    <div>
      <p>{usage.availableBalance} credits remaining</p>
      <progress 
        value={usage.availableBalance} 
        max={1000} // Your plan's limit
      />
    </div>
  )
}
```

### Subscription Status

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function SubscriptionStatus() {
  const { subscriptions, cancelSubscription } = useBilling()
  
  const activeSubscription = subscriptions?.find(
    (s) => s.status === 'active'
  )
  
  if (!activeSubscription) {
    return <div>No active subscription</div>
  }
  
  const handleCancel = async () => {
    await cancelSubscription({
      id: activeSubscription.id,
      cancellation: {
        timing: 'at_end_of_current_billing_period',
      },
    })
  }
  
  return (
    <div>
      <h3>Current Plan</h3>
      <p>Status: {activeSubscription.status}</p>
      <p>
        Renews: {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString()}
      </p>
      <button onClick={handleCancel}>
        Cancel Subscription
      </button>
    </div>
  )
}
```

### Pricing Table

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function PricingTable() {
  const { 
    loaded, 
    pricingModel, 
    currentSubscriptions,
    createCheckoutSession 
  } = useBilling()
  
  if (!loaded || !pricingModel) {
    return <div>Loading pricing...</div>
  }
  
  const currentPlanId = currentSubscriptions?.[0]?.items?.[0]?.priceId
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {pricingModel.products.map((product) => (
        <div key={product.id} className="border p-4 rounded">
          <h3>{product.name}</h3>
          <p>{product.description}</p>
          
          {product.prices.map((price) => (
            <div key={price.id}>
              <p>${(price.unitPrice / 100).toFixed(2)}/{price.intervalUnit}</p>
              
              {currentPlanId === price.id ? (
                <span>Current Plan</span>
              ) : (
                <button
                  onClick={() =>
                    createCheckoutSession({
                      priceId: price.id,
                      successUrl: `${window.location.origin}/success`,
                      cancelUrl: window.location.href,
                      autoRedirect: true,
                    })
                  }
                >
                  Select Plan
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

## Handling Loading States

Always handle loading states to avoid undefined errors:

```tsx
const { loaded, loadBilling, errors, checkFeatureAccess } = useBilling()

// Pattern 1: Early return
if (!loaded || !checkFeatureAccess) {
  return <LoadingSpinner />
}

// Pattern 2: Conditional rendering
{loaded && checkFeatureAccess?.('feature') && (
  <FeatureContent />
)}

// Pattern 3: Default values
const hasFeature = checkFeatureAccess?.('feature') ?? false
```

## Refreshing Data

After mutations (like purchasing a plan), refresh billing data:

```tsx
const { reload } = useBilling()

const handlePurchase = async () => {
  // After checkout completes...
  await reload() // Refresh billing data
}
```

## Next Step

Proceed to **Step 6: Feature Access & Usage Tracking** to implement feature gating and usage metering.

