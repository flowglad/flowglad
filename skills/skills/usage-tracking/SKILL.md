# Usage Tracking

**Version 1.0.0**
Flowglad Engineering
January 2025

> **Note:**
> This document is for AI agents to follow when integrating metered billing and usage tracking with Flowglad.

---

## Abstract

This skill covers implementing usage-based billing with Flowglad, including recording usage events for metered billing, checking usage balances, and displaying usage information to users. Proper implementation ensures accurate billing and prevents users from bypassing usage charges.

---

## Table of Contents

1. [Server-Side vs Client-Side Recording](#1-server-side-vs-client-side-recording) — **CRITICAL**
   - 1.1 [Why Server-Side Recording is Required](#11-why-server-side-recording-is-required)
   - 1.2 [Implementation Patterns](#12-implementation-patterns)
2. [Idempotency with transactionId](#2-idempotency-with-transactionid) — **HIGH**
   - 2.1 [Preventing Double-Charging](#21-preventing-double-charging)
   - 2.2 [Generating Unique Transaction IDs](#22-generating-unique-transaction-ids)
3. [Pre-Check Balance Before Expensive Operations](#3-pre-check-balance-before-expensive-operations) — **MEDIUM**
   - 3.1 [Check Before Consume Pattern](#31-check-before-consume-pattern)
   - 3.2 [Handling Insufficient Balance](#32-handling-insufficient-balance)
4. [Display Patterns for Usage](#4-display-patterns-for-usage) — **MEDIUM**
   - 4.1 [Progress Bars and Counters](#41-progress-bars-and-counters)
   - 4.2 [Real-Time Balance Display](#42-real-time-balance-display)
5. [Handling Exhausted Balance](#5-handling-exhausted-balance) — **MEDIUM**
   - 5.1 [Graceful Degradation](#51-graceful-degradation)
   - 5.2 [Upgrade Prompts](#52-upgrade-prompts)

---

## 1. Server-Side vs Client-Side Recording

**Impact: CRITICAL**

Usage events must always be recorded server-side. Client-side recording is a security vulnerability that allows users to bypass billing entirely.

### 1.1 Why Server-Side Recording is Required

**Impact: CRITICAL (billing integrity depends on this)**

Client-side billing calls can be intercepted, blocked, or modified by users. Any billing-critical operations must happen on the server where the user cannot tamper with them.

**Incorrect: records usage from client**

```typescript
// Client-side component
function GenerateButton() {
  const { createUsageEvent } = useBilling()

  async function handleGenerate() {
    const result = await fetch('/api/generate', { method: 'POST' })
    const data = await result.json()

    // SECURITY ISSUE: User can disable this call in DevTools
    // or modify the amount to 0
    await createUsageEvent({
      usageMeterSlug: 'generations',
      amount: 1,
    })

    return data
  }

  return <button onClick={handleGenerate}>Generate</button>
}
```

Users can bypass client-side billing by:
- Blocking the network request in DevTools
- Modifying the amount parameter
- Disabling JavaScript after the generation completes

**Correct: record usage server-side**

```typescript
// API route - app/api/generate/route.ts
import { flowglad } from '@/lib/flowglad'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Perform the operation
  const result = await generateContent()

  // Usage recorded server-side - cannot be bypassed
  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'generations',
    amount: 1,
    transactionId: `gen_${result.id}`, // Idempotent
  })

  return Response.json(result)
}
```

### 1.2 Implementation Patterns

**Impact: CRITICAL (ensures consistent server-side implementation)**

**Incorrect: mixing client and server billing logic**

```typescript
// Inconsistent approach - some usage tracked client-side
async function handleApiCall() {
  // Some calls go through server
  if (isImportantCall) {
    await fetch('/api/tracked-call', { method: 'POST' })
  } else {
    // "Minor" calls tracked client-side - STILL A VULNERABILITY
    await clientBilling.createUsageEvent({
      usageMeterSlug: 'api-calls',
      amount: 1,
    })
    await fetch('/api/untracked-call', { method: 'POST' })
  }
}
```

**Correct: all usage tracking flows through server**

```typescript
// lib/flowglad.server.ts - Server-only factory
// Use .server.ts extension or place in a server-only directory
// to prevent accidental client-side imports
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      // Fetch user details from your database
      const user = await db.users.findOne({ id: externalId })
      return { email: user.email, name: user.name }
    },
  })
}

// Every API route that consumes resources tracks usage
// app/api/call/route.ts
export async function POST(req: Request) {
  const session = await auth()
  const result = await performOperation()

  await flowglad(session.user.id).createUsageEvent({
    usageMeterSlug: 'api-calls',
    amount: 1,
    transactionId: `call_${result.id}`,
  })

  return Response.json(result)
}
```

---

## 2. Idempotency with transactionId

**Impact: HIGH**

Network failures and retries can cause duplicate usage events. Always include a `transactionId` to ensure each logical operation is only billed once.

### 2.1 Preventing Double-Charging

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

### 2.2 Generating Unique Transaction IDs

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

## 3. Pre-Check Balance Before Expensive Operations

**Impact: MEDIUM**

For operations that consume significant resources or cost money (API calls to AI services, image generation, etc.), check the user's balance before starting the operation.

### 3.1 Check Before Consume Pattern

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

### 3.2 Handling Insufficient Balance

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

## 4. Display Patterns for Usage

**Impact: MEDIUM**

Users need visibility into their usage. Display current balance, usage history, and limits clearly.

### 4.1 Progress Bars and Counters

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

### 4.2 Real-Time Balance Display

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

## 5. Handling Exhausted Balance

**Impact: MEDIUM**

When users run out of credits, provide a clear path to continue using the product.

### 5.1 Graceful Degradation

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

### 5.2 Upgrade Prompts

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

### Recording Usage (Server-Side Only)

```typescript
import { flowglad } from '@/lib/flowglad'

await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'your-meter-slug',
  amount: 1,
  transactionId: `unique_${operationId}`, // Always include!
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

### After Recording Usage

```typescript
// Client-side: reload to update displayed balance
const { reload } = useBilling()
await fetch('/api/consume', { method: 'POST' })
await reload()
```

### HTTP Status Codes for Usage Errors

| Status | Use Case |
|--------|----------|
| `401 Unauthorized` | User not authenticated |
| `402 Payment Required` | Insufficient credits/balance |
| `403 Forbidden` | User authenticated but lacks access to this feature |
| `429 Too Many Requests` | Rate limited (separate from usage billing) |
