# Step 6: Feature Access & Usage Tracking

## Objective

Implement feature gating and usage-based billing in your application.

## Feature Access Overview

Features in Flowglad represent capabilities that customers can access based on their subscription. Use `checkFeatureAccess` to gate premium functionality.

## Client-Side Feature Access

### Basic Feature Check

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function PremiumFeature() {
  const { loaded, checkFeatureAccess } = useBilling()
  
  if (!loaded || !checkFeatureAccess) {
    return <div>Loading...</div>
  }
  
  if (!checkFeatureAccess('premium_feature')) {
    return (
      <div>
        <p>This feature requires a premium subscription.</p>
        <UpgradeButton priceSlug="premium-monthly" />
      </div>
    )
  }
  
  return <PremiumFeatureContent />
}
```

### Feature Gate Component

Create a reusable gate component:

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'
import { ReactNode } from 'react'

interface FeatureGateProps {
  featureSlug: string
  children: ReactNode
  fallback?: ReactNode
  showLoading?: boolean
}

export function FeatureGate({
  featureSlug,
  children,
  fallback = null,
  showLoading = false,
}: FeatureGateProps) {
  const { loaded, errors, checkFeatureAccess } = useBilling()
  
  if (!loaded || !checkFeatureAccess) {
    return showLoading ? <div>Loading...</div> : null
  }
  
  if (errors) {
    return <div>Unable to verify feature access</div>
  }
  
  if (!checkFeatureAccess(featureSlug)) {
    return <>{fallback}</>
  }
  
  return <>{children}</>
}

// Usage
<FeatureGate 
  featureSlug="advanced_analytics"
  fallback={<UpgradePrompt feature="Advanced Analytics" />}
>
  <AdvancedAnalyticsDashboard />
</FeatureGate>
```

## Server-Side Feature Access

For API routes and server actions, check features server-side:

```typescript
// app/api/premium/route.ts
import { NextResponse } from 'next/server'
import { flowglad } from '@/utils/flowglad'

export async function GET(request: Request) {
  // Extract user ID from your auth system
  const userId = await getUserIdFromRequest(request)
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Get billing data server-side
  const billing = await flowglad(userId).getBilling()
  
  // Check feature access
  if (!billing.checkFeatureAccess('premium_api')) {
    return NextResponse.json(
      { 
        error: 'Premium subscription required',
        upgradeUrl: '/pricing' 
      }, 
      { status: 403 }
    )
  }
  
  // Feature is accessible - proceed with the request
  return NextResponse.json({ data: 'premium data' })
}
```

### Server Action Feature Gate

```typescript
'use server'

import { flowglad } from '@/utils/flowglad'
import { getCurrentUserId } from '@/lib/auth'

export async function premiumAction(data: FormData) {
  const userId = await getCurrentUserId()
  
  if (!userId) {
    throw new Error('Unauthorized')
  }
  
  const billing = await flowglad(userId).getBilling()
  
  if (!billing.checkFeatureAccess('premium_action')) {
    throw new Error('Premium subscription required')
  }
  
  // Proceed with action
  // ...
}
```

## Usage-Based Billing

For metered features (API calls, storage, credits, etc.), track usage via usage events.

### Usage Data Model

1. **Usage Meters** - Define what you're measuring (API calls, tokens, storage)
2. **Usage Prices** - Link meters to prices (e.g., $0.01 per API call)
3. **Usage Events** - Record individual consumption instances

### Creating Usage Events (Server-Side Only)

Usage events must be created server-side for security:

```typescript
// utils/usage.ts
import { flowglad } from '@/utils/flowglad'

interface TrackUsageParams {
  customerExternalId: string
  subscriptionId: string
  priceId: string
  usageMeterId: string
  amount: number
  transactionId: string // Unique ID for idempotency
  properties?: Record<string, unknown>
}

export async function trackUsage({
  customerExternalId,
  subscriptionId,
  priceId,
  usageMeterId,
  amount,
  transactionId,
  properties,
}: TrackUsageParams) {
  const usageEvent = await flowglad(customerExternalId).createUsageEvent({
    amount,
    priceId,
    subscriptionId,
    usageMeterId,
    transactionId,
    usageDate: Date.now(),
    properties,
  })
  
  return usageEvent
}
```

### Example: API Call Tracking

```typescript
// app/api/ai/route.ts
import { NextResponse } from 'next/server'
import { flowglad } from '@/utils/flowglad'
import { nanoid } from 'nanoid'

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request)
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Get billing to find subscription and check balance
  const billing = await flowglad(userId).getBilling()
  
  // Check if user has usage balance
  const usage = billing.checkUsageBalance('ai_tokens')
  
  if (!usage || usage.availableBalance <= 0) {
    return NextResponse.json(
      { error: 'No tokens remaining. Please purchase more.' },
      { status: 402 }
    )
  }
  
  // Get the active subscription
  const subscription = billing.currentSubscriptions?.[0]
  
  if (!subscription) {
    return NextResponse.json(
      { error: 'No active subscription' },
      { status: 402 }
    )
  }
  
  // Process the AI request
  const response = await callAI(request)
  const tokensUsed = response.tokensUsed
  
  // Record the usage event
  await flowglad(userId).createUsageEvent({
    amount: tokensUsed,
    priceId: 'price_ai_tokens', // Your usage price ID
    subscriptionId: subscription.id,
    usageMeterId: 'usage_meter_ai_tokens', // Your usage meter ID
    transactionId: `ai-${nanoid()}`, // Unique ID for idempotency
    usageDate: Date.now(),
    properties: {
      model: 'gpt-4',
      endpoint: '/api/ai',
    },
  })
  
  return NextResponse.json({ result: response.result })
}
```

### Example: Monthly Active Users (MAU)

For count distinct properties aggregation:

```typescript
// Record a user activity event
async function recordActiveUser(
  customerExternalId: string,
  userId: string,
  subscriptionId: string
) {
  await flowglad(customerExternalId).createUsageEvent({
    amount: 1,
    priceId: 'price_mau',
    subscriptionId,
    usageMeterId: 'usage_meter_mau',
    transactionId: `mau-${userId}-${new Date().toISOString().slice(0, 7)}`, // Monthly unique
    properties: {
      userId, // This property is counted for distinct values
    },
  })
}
```

## Client-Side Usage Display

### Usage Balance Indicator

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function UsageBalance({ meterSlug }: { meterSlug: string }) {
  const { loaded, checkUsageBalance } = useBilling()
  
  if (!loaded || !checkUsageBalance) {
    return <div>Loading...</div>
  }
  
  const usage = checkUsageBalance(meterSlug)
  
  if (!usage) {
    return <div>No usage meter found</div>
  }
  
  const { availableBalance } = usage
  const maxCredits = 1000 // Your plan's limit
  const usedCredits = maxCredits - availableBalance
  const percentUsed = (usedCredits / maxCredits) * 100
  
  return (
    <div>
      <div className="flex justify-between">
        <span>{availableBalance} credits remaining</span>
        <span>{usedCredits} / {maxCredits} used</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full"
          style={{ width: `${percentUsed}%` }}
        />
      </div>
      {availableBalance < 100 && (
        <p className="text-amber-600 mt-2">
          Running low! Consider purchasing more credits.
        </p>
      )}
    </div>
  )
}
```

### Usage-Gated Feature

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function AIFeature() {
  const { loaded, checkUsageBalance, createCheckoutSession } = useBilling()
  
  if (!loaded || !checkUsageBalance) {
    return <div>Loading...</div>
  }
  
  const usage = checkUsageBalance('ai_tokens')
  
  if (!usage || usage.availableBalance <= 0) {
    return (
      <div>
        <p>You've used all your AI tokens.</p>
        <button
          onClick={() =>
            createCheckoutSession({
              priceSlug: 'ai-tokens-topup',
              successUrl: `${window.location.origin}/dashboard`,
              cancelUrl: window.location.href,
              autoRedirect: true,
            })
          }
        >
          Purchase More Tokens
        </button>
      </div>
    )
  }
  
  return <AIChat />
}
```

## Usage Event Parameters

```typescript
interface CreateUsageEventParams {
  // Required: Quantity of usage
  amount: number
  
  // Required: The usage price ID
  priceId: string
  
  // Required: The customer's subscription ID
  subscriptionId: string
  
  // Required: The usage meter ID
  usageMeterId: string
  
  // Required: Unique ID for idempotency
  // If Flowglad receives a duplicate transactionId, it won't create a new event
  transactionId: string
  
  // Optional: When the usage occurred (defaults to now)
  usageDate?: number // milliseconds since epoch
  
  // Optional: Properties for count_distinct_properties aggregation
  properties?: Record<string, unknown>
}
```

## Idempotency

The `transactionId` ensures usage events aren't duplicated. Use a unique, deterministic ID:

```typescript
// Good patterns
transactionId: `api-call-${requestId}`
transactionId: `user-${userId}-action-${actionId}`
transactionId: `${customerId}-${timestamp}-${randomId}`

// Bad patterns (may cause duplicates or collisions)
transactionId: `${Math.random()}` // Not deterministic
transactionId: `action` // Too generic
```

## Next Step

Proceed to **Step 7: Migrate Existing Billing Code** to replace any mock billing implementations.

