---
name: flowglad-usage-tracking
description: Implement usage-based billing with Flowglad including recording usage events, checking balances, and displaying usage information. Use this skill when adding metered billing, tracking API calls, or implementing consumption-based pricing.
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

## Abstract

This skill covers implementing usage-based billing with Flowglad, including recording usage events for metered billing, checking usage balances, and displaying usage information to users. Proper implementation ensures accurate billing and prevents users from bypassing usage charges.

---

## Table of Contents

1. [Recording Usage Events](#1-recording-usage-events) — **CRITICAL**
   - 1.1 [Client-Side Recording](#11-client-side-recording)
   - 1.2 [Server-Side Recording](#12-server-side-recording)
   - 1.3 [Choosing Client vs Server](#13-choosing-client-vs-server)
2. [Usage Meter Resolution](#2-usage-meter-resolution) — **HIGH**
   - 2.1 [Using usageMeterSlug vs priceSlug](#21-using-usagemeterslug-vs-priceslug)
   - 2.2 [Default No-Charge Prices](#22-default-no-charge-prices)
3. [Idempotency with transactionId](#3-idempotency-with-transactionid) — **HIGH**
   - 3.1 [Preventing Double-Charging](#31-preventing-double-charging)
   - 3.2 [Generating Unique Transaction IDs](#32-generating-unique-transaction-ids)
4. [Pre-Check Balance Before Expensive Operations](#4-pre-check-balance-before-expensive-operations) — **MEDIUM**
   - 4.1 [Check Before Consume Pattern](#41-check-before-consume-pattern)
   - 4.2 [Handling Insufficient Balance](#42-handling-insufficient-balance)
5. [Display Patterns for Usage](#5-display-patterns-for-usage) — **MEDIUM**
   - 5.1 [Progress Bars and Counters](#51-progress-bars-and-counters)
   - 5.2 [Real-Time Balance Display](#52-real-time-balance-display)
6. [Handling Exhausted Balance](#6-handling-exhausted-balance) — **MEDIUM**
   - 6.1 [Graceful Degradation](#61-graceful-degradation)
   - 6.2 [Upgrade Prompts](#62-upgrade-prompts)

---

## 1. Recording Usage Events

**Impact: CRITICAL**

Flowglad supports recording usage events from both client-side and server-side code. Each approach has different APIs and trade-offs.

### 1.1 Client-Side Recording

**Impact: CRITICAL (simplest approach for many use cases)**

Use `useBilling().createUsageEvent` for client-side usage tracking. The client SDK provides smart defaults that simplify implementation.

**Client-side smart defaults:**
- `amount` defaults to `1`
- `transactionId` is auto-generated for idempotency
- `subscriptionId` is auto-inferred from current subscription

**Basic client-side usage:**

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

**With explicit values:**

```tsx
const result = await billing.createUsageEvent({
  usageMeterSlug: 'api-calls',
  amount: 5, // Override default of 1
  // transactionId and subscriptionId still auto-handled
})
```

**Important:** Client-side usage events do not automatically refresh billing data. Call `billing.reload()` after recording if you need to update displayed balances.

```tsx
await billing.createUsageEvent({ usageMeterSlug: 'generations' })
await billing.reload() // Refresh to show updated balance
```

### 1.2 Server-Side Recording

**Impact: CRITICAL (required for atomic operations)**

Use `flowglad(userId).createUsageEvent` for server-side usage tracking. Server-side requires explicit values for all parameters.

**Server-side required parameters:**
- `subscriptionId` - must be provided explicitly
- `transactionId` - must be provided explicitly
- `amount` - must be provided explicitly

**Basic server-side usage:**

```typescript
// API route - app/api/generate/route.ts
import { flowglad } from '@/lib/flowglad'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get billing to find subscriptionId
  const billing = await flowglad(session.user.id).getBilling()
  const subscriptionId = billing.currentSubscription?.id

  if (!subscriptionId) {
    return Response.json({ error: 'No active subscription' }, { status: 402 })
  }

  // Perform the operation
  const result = await generateContent()

  // Record usage with explicit parameters
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

**Impact: CRITICAL (architectural decision)**

Both approaches are valid. Choose based on your needs:

| Use Case | Recommended Approach | Why |
|----------|---------------------|-----|
| Simple button click tracking | Client-side | Smart defaults make it easy |
| Feature usage counters | Client-side | No server round-trip needed |
| AI generation / expensive operations | Server-side | Track atomically with operation |
| API endpoint metering | Server-side | Already on server |
| Operations that cost you money | Server-side | Ensure tracking happens |
| Quick prototyping | Client-side | Fewer files to create |

**Pattern: Atomic server-side tracking**

When an operation costs you money (e.g., calling OpenAI), track usage atomically with the operation:

```typescript
export async function POST(req: Request) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()

  // 1. Check balance first
  const balance = billing.checkUsageBalance('generations')
  if (!balance || balance.availableBalance <= 0) {
    return Response.json({ error: 'No credits' }, { status: 402 })
  }

  // 2. Perform expensive operation
  const result = await openai.images.generate({ prompt })

  // 3. Record usage (atomic with operation)
  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'generations',
    amount: 1,
    subscriptionId: billing.currentSubscription!.id,
    transactionId: `gen_${result.data[0].url}`,
  })

  return Response.json(result)
}
```

**Pattern: Simple client-side tracking**

For tracking feature usage where bypassing isn't a concern:

```tsx
function FeatureButton() {
  const billing = useBilling()

  const handleUse = async () => {
    // Track usage - smart defaults handle the rest
    await billing.createUsageEvent({ usageMeterSlug: 'feature-uses' })
    await billing.reload()
    // Do the feature thing
  }

  return <button onClick={handleUse}>Use Feature</button>
}
```

---

## 2. Usage Meter Resolution

**Impact: HIGH**

When creating usage events, you can identify the usage price by slug or ID. Understanding how these resolve helps you structure your billing correctly.

### 2.1 Using usageMeterSlug vs priceSlug

**Impact: HIGH (determines which price is charged)**

You can identify usage with exactly one of:
- `priceSlug` or `priceId` - targets a specific price directly
- `usageMeterSlug` or `usageMeterId` - resolves to the meter's **default price**

**Using priceSlug (explicit):**

```typescript
await createUsageEvent({
  priceSlug: 'api-calls-standard', // Specific price
  amount: 1,
  // ...
})
```

**Using usageMeterSlug (resolves to default):**

```typescript
await createUsageEvent({
  usageMeterSlug: 'api-calls', // Resolves to meter's default price
  amount: 1,
  // ...
})
```

When using `usageMeterSlug`, the system uses the meter's configured default price. If no custom default is set, it uses the auto-generated no-charge price.

### 2.2 Default No-Charge Prices

**Impact: HIGH (understanding automatic pricing)**

Every usage meter automatically has a **no-charge price** with:
- Slug pattern: `{usagemeterslug}_no_charge`
- Unit price: `$0.00` (always free)
- Cannot be archived or deleted

This means you can start tracking usage immediately without creating a price first:

```typescript
// Works even if no custom price exists for 'api-calls' meter
await createUsageEvent({
  usageMeterSlug: 'api-calls',
  amount: 1,
  // Resolves to 'api-calls_no_charge' if no other default is set
})
```

**When you need paid usage:**

1. Create a usage price in your Flowglad dashboard (e.g., `api-calls-standard` at $0.001/call)
2. Set it as the default price for the meter, OR
3. Reference it directly with `priceSlug: 'api-calls-standard'`

**Checking which price was used:**

The response from `createUsageEvent` always includes the resolved `priceId`:

```typescript
const result = await createUsageEvent({ usageMeterSlug: 'api-calls', amount: 1 })

if (!('error' in result)) {
  console.log('Charged to price:', result.usageEvent.priceId)
}
```

---

## 3. Idempotency with transactionId

**Impact: HIGH**

Network failures and retries can cause duplicate usage events. Always include a `transactionId` to ensure each logical operation is only billed once.

### 3.1 Preventing Double-Charging

**Impact: HIGH (prevents billing disputes and customer trust issues)**

Without idempotency, a network timeout followed by a retry could charge the user twice for the same operation.

**Incorrect: no idempotency key**

```typescript
// API route
export async function POST(req: Request) {
  const session = await auth()
  const result = await generateImage(prompt)

  // If this request times out and retries, user gets double-charged!
  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'image-generations',
    amount: 1,
  })

  return Response.json(result)
}
```

**Correct: always include transactionId**

```typescript
// API route
export async function POST(req: Request) {
  const session = await auth()
  const result = await generateImage(prompt)

  // Safe for retries - same transactionId = same event
  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'image-generations',
    amount: 1,
    transactionId: `img_${result.id}`, // Unique per logical operation
  })

  return Response.json(result)
}
```

### 3.2 Generating Unique Transaction IDs

**Impact: HIGH (ensures uniqueness across all operations)**

Transaction IDs must be unique per logical operation, not per request. Use deterministic IDs based on the operation's output or a combination of user, timestamp, and operation details.

**Incorrect: using random IDs**

```typescript
// Random IDs don't prevent duplicates on retry
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'api-calls',
  amount: 1,
  transactionId: crypto.randomUUID(), // New ID on every retry!
})
```

**Correct: use deterministic IDs based on the operation**

```typescript
// Option 1: Use the result's ID
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'generations',
  amount: 1,
  transactionId: `gen_${result.id}`,
})

// Option 2: Use request ID from incoming request header
// IMPORTANT: Only use if your client sends a stable x-request-id on retries
const requestId = req.headers.get('x-request-id')
if (!requestId) {
  return Response.json({ error: 'x-request-id header required' }, { status: 400 })
}
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'api-calls',
  amount: 1,
  transactionId: `req_${requestId}`,
})

// Option 3: Hash of operation parameters for deterministic operations
import { createHash } from 'crypto'

function hashOperationParams(params: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16)
}

const operationHash = hashOperationParams({ userId, prompt })
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'queries',
  amount: 1,
  transactionId: `query_${operationHash}`,
})
```

---

## 4. Pre-Check Balance Before Expensive Operations

**Impact: MEDIUM**

For operations that consume significant resources or cost money (API calls to AI services, image generation, etc.), check the user's balance before starting the operation.

### 4.1 Check Before Consume Pattern

**Impact: MEDIUM (prevents wasted compute and poor user experience)**

Running an expensive operation only to discover the user has no credits wastes resources and frustrates users.

**Incorrect: runs expensive operation, then fails on billing**

```typescript
async function generateImage(userId: string, prompt: string) {
  // Spends $0.10 on AI generation
  const image = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
  })

  // Then discovers user has no credits - too late, we already paid OpenAI!
  const billing = await flowglad(userId).getBilling()
  const balance = billing.checkUsageBalance('image-generations')

  if (balance.availableBalance <= 0) {
    throw new Error('No credits') // User got nothing, we lost money
  }

  await flowglad(userId).createUsageEvent({
    usageMeterSlug: 'image-generations',
    amount: 1,
  })

  return image
}
```

**Correct: check balance first**

```typescript
async function generateImage(userId: string, prompt: string) {
  // Check balance BEFORE the expensive operation
  const billing = await flowglad(userId).getBilling()
  const balance = billing.checkUsageBalance('image-generations')

  if (balance.availableBalance <= 0) {
    throw new InsufficientCreditsError('No credits remaining. Please upgrade.')
  }

  // Now safe to proceed
  const image = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
  })

  // Use a stable identifier from the operation result
  // The image URL or a hash of the image data provides idempotency
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

### 4.2 Handling Insufficient Balance

**Impact: MEDIUM (clear error handling improves user experience)**

**Incorrect: generic error message**

```typescript
if (balance.availableBalance <= 0) {
  throw new Error('Operation failed')
}
```

**Correct: specific error with upgrade path**

```typescript
class InsufficientCreditsError extends Error {
  constructor(
    public meterSlug: string,
    public availableBalance: number,
    public required: number
  ) {
    super(
      `Insufficient credits for ${meterSlug}. ` +
      `Available: ${availableBalance}, Required: ${required}`
    )
    this.name = 'InsufficientCreditsError'
  }
}

// In API route - throwing the error
if (balance.availableBalance < requiredAmount) {
  throw new InsufficientCreditsError(
    'image-generations',
    balance.availableBalance,
    requiredAmount
  )
}

// Catching and handling the error in your API route
export async function POST(req: Request) {
  try {
    const result = await generateImage(userId, prompt)
    return Response.json(result)
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json(
        {
          error: 'insufficient_credits',
          message: error.message,
          availableBalance: error.availableBalance,
          required: error.required,
          upgradeUrl: '/pricing',
        },
        { status: 402 } // Payment Required
      )
    }
    throw error // Re-throw unexpected errors
  }
}
```

---

## 5. Display Patterns for Usage

**Impact: MEDIUM**

Users need visibility into their usage. Display current balance, usage history, and limits clearly.

### 5.1 Progress Bars and Counters

**Impact: MEDIUM (transparency builds trust)**

**Incorrect: shows usage without context**

```tsx
function UsageDisplay() {
  const { checkUsageBalance } = useBilling()
  const balance = checkUsageBalance('api-calls')

  // Just showing a number is confusing
  return <div>Usage: {balance.usedBalance}</div>
}
```

**Correct: shows usage with limit and visual progress**

```tsx
import { useBilling } from '@flowglad/nextjs'

function UsageDisplay() {
  const { loaded, checkUsageBalance } = useBilling()

  if (!loaded) {
    return <UsageSkeleton />
  }

  const balance = checkUsageBalance('api-calls')

  // Handle unlimited plans (balanceLimit is null)
  // For unlimited plans, show usage count without percentage
  const hasLimit = balance.balanceLimit != null
  const percentUsed = hasLimit
    ? (balance.usedBalance / balance.balanceLimit!) * 100
    : 0

  // For unlimited plans, skip the progress bar entirely
  if (!hasLimit) {
    return (
      <div className="text-sm">
        <span>API Calls: {balance.usedBalance.toLocaleString()}</span>
        <span className="text-gray-500 ml-1">(Unlimited)</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>API Calls</span>
        <span>
          {balance.usedBalance.toLocaleString()} / {balance.balanceLimit?.toLocaleString() ?? 'Unlimited'}
        </span>
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
        <p className="text-sm text-red-600">
          You're approaching your limit. Consider upgrading.
        </p>
      )}
    </div>
  )
}
```

### 5.2 Real-Time Balance Display

**Impact: MEDIUM (accurate display after mutations)**

**Incorrect: stale balance after usage**

```tsx
function Dashboard() {
  const { checkUsageBalance } = useBilling()

  async function handleGenerate() {
    await fetch('/api/generate', { method: 'POST' })
    // Balance display is now stale - shows old value
  }

  const balance = checkUsageBalance('generations')

  return (
    <div>
      <p>Remaining: {balance.availableBalance}</p>
      <button onClick={handleGenerate}>Generate</button>
    </div>
  )
}
```

**Correct: reload billing after usage**

```tsx
function Dashboard() {
  const { checkUsageBalance, reload, loaded } = useBilling()
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await fetch('/api/generate', { method: 'POST' })
      // Refresh billing data to show updated balance
      await reload()
    } finally {
      setIsGenerating(false)
    }
  }

  if (!loaded) {
    return <LoadingSkeleton />
  }

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

**Impact: MEDIUM**

When users run out of credits, provide a clear path to continue using the product.

### 6.1 Graceful Degradation

**Impact: MEDIUM (maintains usability when credits exhausted)**

**Incorrect: hard block with no explanation**

```tsx
function FeatureComponent() {
  const { checkUsageBalance } = useBilling()
  const balance = checkUsageBalance('generations')

  if (balance.availableBalance <= 0) {
    return null // Feature just disappears
  }

  return <GenerateForm />
}
```

**Correct: explain the situation and offer solutions**

```tsx
function FeatureComponent() {
  const { loaded, checkUsageBalance, createCheckoutSession } = useBilling()

  if (!loaded) {
    return <LoadingSkeleton />
  }

  const balance = checkUsageBalance('generations')

  if (balance.availableBalance <= 0) {
    return (
      <div className="p-6 border rounded-lg bg-gray-50">
        <h3 className="font-semibold text-lg">Out of generations</h3>
        <p className="text-gray-600 mt-2">
          You've used all {balance.balanceLimit} generations this month.
          Upgrade to continue creating.
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

### 6.2 Upgrade Prompts

**Impact: MEDIUM (converts free users at the right moment)**

**Incorrect: shows upgrade prompt at random times**

```tsx
// Showing upgrade randomly is annoying
function Dashboard() {
  const showUpgrade = Math.random() > 0.7

  return (
    <div>
      {showUpgrade && <UpgradePrompt />}
      <MainContent />
    </div>
  )
}
```

**Correct: show upgrade when contextually relevant**

```tsx
function Dashboard() {
  const { loaded, checkUsageBalance } = useBilling()

  if (!loaded) {
    return <LoadingSkeleton />
  }

  const balance = checkUsageBalance('generations')
  const percentUsed = balance.balanceLimit
    ? (balance.usedBalance / balance.balanceLimit) * 100
    : 0

  // Show upgrade prompts at meaningful thresholds
  const showUpgrade = percentUsed >= 80

  return (
    <div>
      {showUpgrade && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800">
            {percentUsed >= 100
              ? "You've used all your generations this month."
              : `You've used ${Math.round(percentUsed)}% of your generations.`}
            {' '}
            <a href="/pricing" className="underline font-medium">
              Upgrade for unlimited access
            </a>
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

// With smart defaults (amount: 1, auto transactionId, auto subscriptionId)
await billing.createUsageEvent({ usageMeterSlug: 'your-meter-slug' })

// With explicit amount
await billing.createUsageEvent({ usageMeterSlug: 'your-meter-slug', amount: 5 })

// Don't forget to reload if showing balance
await billing.reload()
```

### Recording Usage (Server-Side)

```typescript
import { flowglad } from '@/lib/flowglad'

const billing = await flowglad(userId).getBilling()

await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'your-meter-slug', // or priceSlug for specific price
  amount: 1,
  subscriptionId: billing.currentSubscription!.id,
  transactionId: `unique_${operationId}`,
})
```

### Checking Balance (Client or Server)

```typescript
// Client-side
const { checkUsageBalance } = useBilling()
const balance = checkUsageBalance('your-meter-slug')
// balance.availableBalance, balance.usedBalance, balance.balanceLimit

// Server-side
const billing = await flowglad(userId).getBilling()
const balance = billing.checkUsageBalance('your-meter-slug')
```

### Usage Meter Resolution

```typescript
// Using usageMeterSlug - resolves to meter's default price
await createUsageEvent({ usageMeterSlug: 'api-calls', ... })

// Using priceSlug - targets specific price directly
await createUsageEvent({ priceSlug: 'api-calls-standard', ... })

// Every meter has auto-generated no-charge price: {slug}_no_charge
```

### HTTP Status Codes for Usage Errors

| Status | Use Case |
|--------|----------|
| `401 Unauthorized` | User not authenticated |
| `402 Payment Required` | Insufficient credits/balance |
| `403 Forbidden` | User authenticated but lacks access to this feature |
| `429 Too Many Requests` | Rate limited (separate from usage billing) |
