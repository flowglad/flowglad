---
name: flowglad-usage-tracking
description: "Implement usage-based billing with Flowglad including recording usage events, checking balances, and displaying usage information. Use this skill when adding metered billing, tracking API calls, or implementing consumption-based pricing."
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/features/usage.mdx
  - platform/docs/sdks/feature-access-usage.mdx
-->

# Usage Tracking

## Priority Reference

| Priority | Sections |
|----------|----------|
| CRITICAL | Recording Usage Events, Client vs Server Selection |
| HIGH | Usage Meter Resolution, Idempotency with transactionId |
| MEDIUM | Pre-Check Balance, Display Patterns, Handling Exhausted Balance |

---

## Table of Contents

1. [Recording Usage Events](#1-recording-usage-events)
   - 1.1 [Client-Side Recording](#11-client-side-recording)
   - 1.2 [Server-Side Recording](#12-server-side-recording)
   - 1.3 [Choosing Client vs Server](#13-choosing-client-vs-server)
2. [Usage Meter Resolution](#2-usage-meter-resolution)
3. [Idempotency with transactionId](#3-idempotency-with-transactionid)
4. [Pre-Check Balance Before Expensive Operations](#4-pre-check-balance-before-expensive-operations)
5. [Display Patterns for Usage](#5-display-patterns-for-usage)
6. [Handling Exhausted Balance](#6-handling-exhausted-balance)

---

## 1. Recording Usage Events

Flowglad supports recording usage from both client and server. Each has different APIs and trade-offs.

### 1.1 Client-Side Recording

Use `useBilling().createUsageEvent` for client-side tracking. Smart defaults: `amount` defaults to `1`, `transactionId` is auto-generated, `subscriptionId` is auto-inferred.

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

function RecordUsageButton({ usageMeterSlug }: { usageMeterSlug: string }) {
  const billing = useBilling()

  const handleClick = async () => {
    if (!billing.createUsageEvent) return

    const result = await billing.createUsageEvent({
      usageMeterSlug,
      // amount defaults to 1
      // transactionId auto-generated
      // subscriptionId auto-inferred
    })

    if ('error' in result) {
      console.error('Failed to record usage:', result.error)
      return
    }

    console.log('Usage recorded:', result.usageEvent.id)
  }

  return <button onClick={handleClick}>Use Feature</button>
}
```

**With explicit amount:**

```tsx
await billing.createUsageEvent({ usageMeterSlug: 'api-calls', amount: 5 })
```

**Important:** Client-side events do not automatically refresh billing data. Call `billing.reload()` after recording to update displayed balances:

```tsx
await billing.createUsageEvent({ usageMeterSlug: 'generations' })
await billing.reload()
```

### 1.2 Server-Side Recording

Use `flowglad(userId).createUsageEvent` for server-side tracking. All parameters are required:
- `subscriptionId` — must be provided explicitly
- `transactionId` — must be provided explicitly
- `amount` — must be provided explicitly

```typescript
import { flowglad } from '@/lib/flowglad'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const billing = await flowglad(session.user.id).getBilling()
  const subscriptionId = billing.currentSubscription?.id

  if (!subscriptionId) {
    return Response.json({ error: 'No active subscription' }, { status: 402 })
  }

  const result = await generateContent()

  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'generations',
    amount: 1,
    subscriptionId,
    transactionId: `gen_${result.id}`,
  })

  return Response.json(result)
}
```

### 1.3 Choosing Client vs Server

| Use Case | Approach | Why |
|----------|----------|-----|
| Button click tracking | Client | Smart defaults, no round-trip |
| Feature counters | Client | Simple, quick prototyping |
| AI generation / expensive ops | Server | Atomic with operation |
| API endpoint metering | Server | Already on server |
| Operations that cost you money | Server | Ensures tracking happens |

**Atomic server-side tracking** — when an operation costs money (e.g., calling OpenAI), track usage atomically:

```typescript
export async function POST(req: Request) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()

  const balance = billing.checkUsageBalance('generations')
  if (!balance || balance.availableBalance <= 0) {
    return Response.json({ error: 'No credits' }, { status: 402 })
  }

  const result = await openai.images.generate({ prompt })

  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'generations',
    amount: 1,
    subscriptionId: billing.currentSubscription!.id,
    transactionId: `gen_${result.data[0].url}`,
  })

  return Response.json(result)
}
```

---

## 2. Usage Meter Resolution

You can identify the usage price with exactly one of:
- `priceSlug` or `priceId` — targets a specific price directly
- `usageMeterSlug` or `usageMeterId` — resolves to the meter's **default price**

```typescript
// Explicit price
await createUsageEvent({ priceSlug: 'api-calls-standard', amount: 1 })

// Resolves to meter's default price
await createUsageEvent({ usageMeterSlug: 'api-calls', amount: 1 })
```

When using `usageMeterSlug`, if no custom default is set, the auto-generated no-charge price is used.

### Default No-Charge Prices

Every usage meter automatically has a **no-charge price**:
- Slug pattern: `{usagemeterslug}_no_charge`
- Unit price: `$0.00`
- Cannot be archived or deleted

This lets you track usage immediately without configuring a price first. When you need paid usage:

1. Create a usage price in your Flowglad dashboard (e.g., `api-calls-standard` at $0.001/call)
2. Set it as the default price for the meter, OR
3. Reference it directly with `priceSlug: 'api-calls-standard'`

The response always includes the resolved `priceId`:

```typescript
const result = await createUsageEvent({ usageMeterSlug: 'api-calls', amount: 1 })
if (!('error' in result)) {
  console.log('Charged to price:', result.usageEvent.priceId)
}
```

---

## 3. Idempotency with transactionId

Network failures and retries can cause duplicate events. Always include a `transactionId` to ensure each operation is billed once.

**Without idempotency (incorrect)** — a timeout followed by retry double-charges the user:

```typescript
// If this request times out and retries, user gets double-charged!
await flowglad(session.user.id).createUsageEvent({
  usageMeterSlug: 'image-generations',
  amount: 1,
})
```

**With transactionId (correct):**

```typescript
await flowglad(session.user.id).createUsageEvent({
  usageMeterSlug: 'image-generations',
  amount: 1,
  transactionId: `img_${result.id}`, // Same ID on retry = same event
})
```

Transaction IDs must be unique per logical operation, not per request. The simplest approach is deriving them from the operation result's ID (`gen_${result.id}`).

For advanced patterns (hash-based IDs, request header IDs), see [PATTERNS.md](./PATTERNS.md#hash-based-transaction-id-generation).

---

## 4. Pre-Check Balance Before Expensive Operations

For operations that consume costly resources, check the user's balance first to avoid wasting compute.

**Correct: check balance first**

```typescript
async function generateImage(userId: string, prompt: string) {
  const billing = await flowglad(userId).getBilling()
  const balance = billing.checkUsageBalance('image-generations')

  if (balance.availableBalance <= 0) {
    throw new InsufficientCreditsError('No credits remaining. Please upgrade.')
  }

  const image = await openai.images.generate({ model: 'dall-e-3', prompt })

  const imageId = image.data[0].url?.split('/').pop()?.split('.')[0] ||
    createHash('sha256').update(prompt + userId).digest('hex').slice(0, 16)

  await flowglad(userId).createUsageEvent({
    usageMeterSlug: 'image-generations',
    amount: 1,
    transactionId: `img_${imageId}`,
  })

  return image
}
```

### Handling Insufficient Balance

Return a specific error with an upgrade path rather than a generic failure:

```typescript
if (balance.availableBalance < requiredAmount) {
  return Response.json(
    {
      error: 'insufficient_credits',
      message: `Available: ${balance.availableBalance}, Required: ${requiredAmount}`,
      upgradeUrl: '/pricing',
    },
    { status: 402 }
  )
}
```

For a typed `InsufficientCreditsError` class and full API route error handling, see [PATTERNS.md](./PATTERNS.md#insufficientcreditserror).

---

## 5. Display Patterns for Usage

### Progress Bars and Counters

Show usage with limit context and visual progress. Handle `balanceLimit == null` for unlimited plans by showing count only.

```tsx
import { useBilling } from '@flowglad/nextjs'

function UsageDisplay() {
  const { loaded, checkUsageBalance } = useBilling()
  if (!loaded) return <UsageSkeleton />

  const balance = checkUsageBalance('api-calls')
  const hasLimit = balance.balanceLimit != null
  const percentUsed = hasLimit ? (balance.usedBalance / balance.balanceLimit!) * 100 : 0

  if (!hasLimit) {
    return <div className="text-sm">API Calls: {balance.usedBalance.toLocaleString()} (Unlimited)</div>
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>API Calls</span>
        <span>{balance.usedBalance.toLocaleString()} / {balance.balanceLimit?.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            percentUsed > 90 ? 'bg-red-500' : percentUsed > 75 ? 'bg-yellow-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
      {percentUsed > 90 && (
        <p className="text-sm text-red-600">Approaching your limit. Consider upgrading.</p>
      )}
    </div>
  )
}
```

### Real-Time Balance Display

Always call `reload()` after mutations to keep displayed balances accurate:

```tsx
function Dashboard() {
  const { checkUsageBalance, reload, loaded } = useBilling()
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await fetch('/api/generate', { method: 'POST' })
      await reload() // Refresh billing data
    } finally {
      setIsGenerating(false)
    }
  }

  if (!loaded) return <LoadingSkeleton />

  const balance = checkUsageBalance('generations')

  return (
    <div>
      <p>Remaining: {balance.availableBalance}</p>
      <button onClick={handleGenerate} disabled={isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate'}
      </button>
    </div>
  )
}
```

---

## 6. Handling Exhausted Balance

### Graceful Degradation

When credits are exhausted, explain the situation and offer solutions:

```tsx
function FeatureComponent() {
  const { loaded, checkUsageBalance, createCheckoutSession } = useBilling()

  if (!loaded) return <LoadingSkeleton />

  const balance = checkUsageBalance('generations')

  if (balance.availableBalance <= 0) {
    return (
      <div className="p-6 border rounded-lg bg-gray-50">
        <h3 className="font-semibold text-lg">Out of generations</h3>
        <p className="text-gray-600 mt-2">
          You've used all {balance.balanceLimit} generations this month.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() =>
              createCheckoutSession({
                priceSlug: 'pro-monthly',
                successUrl: `${window.location.origin}/dashboard?upgraded=true`,
                cancelUrl: window.location.href,
                autoRedirect: true,
              })
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Upgrade to Pro
          </button>
          <button
            onClick={() => window.location.href = '/pricing'}
            className="px-4 py-2 border rounded-lg"
          >
            View Plans
          </button>
        </div>
      </div>
    )
  }

  return <GenerateForm />
}
```

### Contextual Upgrade Prompts

Show upgrade prompts at meaningful thresholds (e.g., 80%+ usage), not randomly:

```tsx
function Dashboard() {
  const { loaded, checkUsageBalance } = useBilling()
  if (!loaded) return <LoadingSkeleton />

  const balance = checkUsageBalance('generations')
  const percentUsed = balance.balanceLimit
    ? (balance.usedBalance / balance.balanceLimit) * 100 : 0

  return (
    <div>
      {percentUsed >= 80 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800">
            {percentUsed >= 100
              ? "You've used all your generations this month."
              : `You've used ${Math.round(percentUsed)}% of your generations.`}{' '}
            <a href="/pricing" className="underline font-medium">Upgrade for unlimited access</a>
          </p>
        </div>
      )}
      <MainContent />
    </div>
  )
}
```

---

## Quick Reference

### Recording Usage (Client-Side)

```tsx
const billing = useBilling()
await billing.createUsageEvent({ usageMeterSlug: 'your-meter-slug' })
await billing.createUsageEvent({ usageMeterSlug: 'your-meter-slug', amount: 5 })
await billing.reload() // Refresh if showing balance
```

### Recording Usage (Server-Side)

```typescript
const billing = await flowglad(userId).getBilling()
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'your-meter-slug',
  amount: 1,
  subscriptionId: billing.currentSubscription!.id,
  transactionId: `unique_${operationId}`,
})
```

### Checking Balance

```typescript
// Client: const { checkUsageBalance } = useBilling()
// Server: const billing = await flowglad(userId).getBilling()
const balance = checkUsageBalance('your-meter-slug')
// balance.availableBalance, balance.usedBalance, balance.balanceLimit
```

### Usage Meter Resolution

```typescript
await createUsageEvent({ usageMeterSlug: 'api-calls', ... }) // Default price
await createUsageEvent({ priceSlug: 'api-calls-standard', ... }) // Specific price
// Every meter has auto-generated no-charge price: {slug}_no_charge
```

### HTTP Status Codes

| Status | Use Case |
|--------|----------|
| `401` | User not authenticated |
| `402` | Insufficient credits/balance |
| `403` | Authenticated but lacks feature access |
| `429` | Rate limited (separate from usage billing) |
