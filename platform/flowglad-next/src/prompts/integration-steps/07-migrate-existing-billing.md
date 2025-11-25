# Step 7: Migrate Existing Billing Code

## Objective

Replace any existing mock billing hooks, placeholder billing utilities, or local storage-based billing with Flowglad.

## Overview

If your project has existing billing code (mock implementations, placeholder hooks, or local state), you'll need to migrate to Flowglad. The `useBilling` hook is designed to be a drop-in replacement for common billing patterns.

## Identifying Existing Billing Code

Search your codebase for common patterns:

```bash
# Search for billing-related files
grep -r "useBilling" --include="*.ts" --include="*.tsx"
grep -r "billing" --include="*.ts" --include="*.tsx"
grep -r "subscription" --include="*.ts" --include="*.tsx"
grep -r "localStorage.*billing" --include="*.ts" --include="*.tsx"
```

Common files to check:
- `hooks/useBilling.ts`
- `context/BillingContext.tsx`
- `utils/billing.ts`
- `lib/billing.ts`
- Components with "pricing", "subscription", "plan" in the name

## Migration Patterns

### Replace Mock useBilling Hook

**Before (Mock Implementation):**

```typescript
// hooks/useBilling.ts (OLD - to be replaced)
export function useBilling() {
  const [balance, setBalance] = useState(
    JSON.parse(localStorage.getItem('credits') || '100')
  )
  
  const decrementUsageBalance = (amount: number) => {
    const newBalance = balance - amount
    setBalance(newBalance)
    localStorage.setItem('credits', JSON.stringify(newBalance))
  }
  
  return {
    balance,
    decrementUsageBalance,
    plan: 'free',
  }
}
```

**After (Flowglad):**

```typescript
// Delete the old file and update imports

// In your component:
// BEFORE
import { useBilling } from '@/hooks/useBilling'

// AFTER
import { useBilling } from '@flowglad/nextjs' // or '@flowglad/react'
```

### Update Components Using the Hook

**Before:**

```tsx
function Dashboard() {
  const { balance, decrementUsageBalance, plan } = useBilling()
  
  const handleAction = () => {
    if (balance > 0) {
      doAction()
      decrementUsageBalance(1)
    }
  }
  
  return (
    <div>
      <p>Credits: {balance}</p>
      <p>Plan: {plan}</p>
      <button onClick={handleAction} disabled={balance <= 0}>
        Use Credit
      </button>
    </div>
  )
}
```

**After:**

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

function Dashboard() {
  const { 
    loaded, 
    checkUsageBalance, 
    currentSubscriptions,
    reload 
  } = useBilling()
  
  if (!loaded) {
    return <div>Loading...</div>
  }
  
  const usage = checkUsageBalance?.('credits')
  const balance = usage?.availableBalance ?? 0
  const plan = currentSubscriptions?.[0]?.items?.[0]?.product?.name ?? 'Free'
  
  const handleAction = async () => {
    if (balance > 0) {
      // Call your API to do the action and record usage
      await fetch('/api/action', { method: 'POST' })
      // Refresh billing data after usage
      await reload()
    }
  }
  
  return (
    <div>
      <p>Credits: {balance}</p>
      <p>Plan: {plan}</p>
      <button onClick={handleAction} disabled={balance <= 0}>
        Use Credit
      </button>
    </div>
  )
}
```

### Replace Feature Checks

**Before:**

```tsx
function PremiumFeature() {
  const { plan } = useBilling()
  
  if (plan !== 'premium') {
    return <UpgradePrompt />
  }
  
  return <FeatureContent />
}
```

**After:**

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

function PremiumFeature() {
  const { loaded, checkFeatureAccess } = useBilling()
  
  if (!loaded || !checkFeatureAccess) {
    return <div>Loading...</div>
  }
  
  if (!checkFeatureAccess('premium_feature')) {
    return <UpgradePrompt />
  }
  
  return <FeatureContent />
}
```

### Replace Local Storage Billing

**Before:**

```typescript
// utils/billing.ts (OLD)
export function getCredits() {
  return JSON.parse(localStorage.getItem('credits') || '0')
}

export function setCredits(amount: number) {
  localStorage.setItem('credits', JSON.stringify(amount))
}

export function useCredits(amount: number) {
  const current = getCredits()
  if (current >= amount) {
    setCredits(current - amount)
    return true
  }
  return false
}
```

**After:**

Delete the file. Usage is now tracked server-side via Flowglad:

```typescript
// app/api/use-credits/route.ts
import { flowglad } from '@/utils/flowglad'

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request)
  const { amount } = await request.json()
  
  const billing = await flowglad(userId).getBilling()
  const usage = billing.checkUsageBalance('credits')
  
  if (!usage || usage.availableBalance < amount) {
    return new Response('Insufficient credits', { status: 402 })
  }
  
  // Record usage event
  const subscription = billing.currentSubscriptions?.[0]
  await flowglad(userId).createUsageEvent({
    amount,
    priceId: 'price_credits',
    subscriptionId: subscription!.id,
    usageMeterId: 'usage_meter_credits',
    transactionId: `credits-${Date.now()}-${Math.random()}`,
  })
  
  return new Response('OK')
}
```

### Replace Pricing Data

**Before:**

```typescript
// utils/pricing.ts (OLD)
export const plans = [
  { id: 'free', name: 'Free', price: 0, features: ['basic'] },
  { id: 'pro', name: 'Pro', price: 29, features: ['basic', 'advanced'] },
]
```

**After:**

Get pricing from Flowglad:

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

function PricingPage() {
  const { loaded, pricingModel } = useBilling()
  
  if (!loaded || !pricingModel) {
    return <div>Loading pricing...</div>
  }
  
  return (
    <div>
      {pricingModel.products.map((product) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

## API Mapping Reference

| Old Pattern | Flowglad Equivalent |
|-------------|---------------------|
| `useBilling()` | `useBilling()` from `@flowglad/nextjs` |
| `plan`, `currentPlan` | `currentSubscriptions?.[0]` |
| `balance`, `credits` | `checkUsageBalance('meter-slug')` |
| `decrementBalance()` | Server-side `createUsageEvent()` + `reload()` |
| `isPremium`, `hasPlan('x')` | `checkFeatureAccess('feature-slug')` |
| `plans`, `pricingData` | `pricingModel.products` |
| `checkout()`, `upgrade()` | `createCheckoutSession()` |
| `cancelSubscription()` | `cancelSubscription()` |

## Cleanup Checklist

After migration:

- [ ] Delete old billing hook files (`hooks/useBilling.ts`, etc.)
- [ ] Delete old billing context files (`context/BillingContext.tsx`, etc.)
- [ ] Delete old billing utility files (`utils/billing.ts`, etc.)
- [ ] Remove localStorage billing code
- [ ] Update all imports to use `@flowglad/nextjs` or `@flowglad/react`
- [ ] Remove hard-coded plan data
- [ ] Remove mock pricing arrays

## Testing Migration

1. **Test unauthenticated state:**
   - Billing should not load
   - Upgrade prompts should appear

2. **Test free user:**
   - Should see basic features
   - Premium features should be gated
   - Checkout should work

3. **Test paid user:**
   - Should see premium features
   - Usage balance should reflect actual usage
   - Subscription management should work

4. **Test usage tracking:**
   - Usage events should be recorded
   - Balance should decrease after usage
   - `reload()` should fetch updated balances

## Next Step

Proceed to **Step 8: Final Verification** to verify your integration is complete.

