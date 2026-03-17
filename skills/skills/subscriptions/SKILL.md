---
name: flowglad-subscriptions
description: "Manage subscription lifecycle including cancellation, plan changes, reactivation, and status display. Use this skill when users need to upgrade, downgrade, cancel, or reactivate subscriptions."
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/features/subscriptions.mdx
  - platform/docs/sdks/subscription-management.mdx
-->

# Subscriptions Management

## Table of Contents

1. [Reload After Mutations](#1-reload-after-mutations) — **CRITICAL**
   - 1.1 [Client-Side State Sync](#11-client-side-state-sync)
   - 1.2 [Server-Side Reload Pattern](#12-server-side-reload-pattern)
2. [Cancel Timing Options](#2-cancel-timing-options) — **HIGH**
   - 2.1 [End of Period vs Immediate](#21-end-of-period-vs-immediate)
   - 2.2 [User Communication](#22-user-communication)
3. [Upgrade vs Downgrade Behavior](#3-upgrade-vs-downgrade-behavior) — **HIGH**
   - 3.1 [Immediate Upgrades](#31-immediate-upgrades)
   - 3.2 [Deferred Downgrades](#32-deferred-downgrades)
4. [Reactivation with uncancelSubscription](#4-reactivation-with-uncancelsubscription) — **MEDIUM**
5. [Trial Status Detection](#5-trial-status-detection) — **MEDIUM**
6. [Subscription Status Display](#6-subscription-status-display) — **MEDIUM**

---

## 1. Reload After Mutations

**Impact: CRITICAL**

After any subscription mutation (cancel, upgrade, downgrade, reactivate), the local billing state is stale. Failing to reload causes UI to show outdated subscription information.

### 1.1 Client-Side State Sync

**Impact: CRITICAL (users see incorrect subscription status)**

When using `useBilling()` on the client, mutations update the server but the local state remains stale until explicitly reloaded.

**Correct: reload after mutation**

```tsx
function CancelButton() {
  const { cancelSubscription, currentSubscription, reload } = useBilling()
  const [isLoading, setIsLoading] = useState(false)

  const handleCancel = async () => {
    setIsLoading(true)
    try {
      await cancelSubscription({
        id: currentSubscription.id,
        cancellation: { timing: 'at_end_of_current_billing_period' },
      })
      // Refresh local state to reflect the cancellation
      await reload()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleCancel} disabled={isLoading}>
        {isLoading ? 'Canceling...' : 'Cancel Subscription'}
      </button>
      <p>Status: {currentSubscription?.status}</p>
    </div>
  )
}
```

### 1.2 Server-Side Reload Pattern

**Impact: CRITICAL (server actions may return stale data)**

When performing mutations server-side, fetch fresh data after the mutation rather than returning the pre-mutation billing object.

**Incorrect: returns stale billing data**

```typescript
export async function upgradeSubscription(priceSlug: string) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()
  await billing.adjustSubscription({ priceSlug })
  // BUG: billing object still has old data!
  return { success: true, subscription: billing.currentSubscription }
}
```

**Correct: fetch fresh billing after mutation**

```typescript
export async function upgradeSubscription(priceSlug: string) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()
  await billing.adjustSubscription({ priceSlug })
  // Fetch fresh billing state after mutation
  const freshBilling = await flowglad(session.user.id).getBilling()
  return { success: true, subscription: freshBilling.currentSubscription }
}
```

---

## 2. Cancel Timing Options

**Impact: HIGH**

Flowglad supports two cancellation timing modes. Using the wrong mode leads to billing disputes and poor user experience.

### 2.1 End of Period vs Immediate

**Impact: HIGH (billing and access implications)**

Most SaaS applications should cancel at the end of the billing period to let users keep access for time they've paid for.

```typescript
async function handleCancel() {
  await billing.cancelSubscription({
    id: billing.currentSubscription.id,
    // User keeps access until their paid period ends
    cancellation: { timing: 'at_end_of_current_billing_period' },
  })
  await billing.reload()
}
```

Use `immediately` only for specific cases like fraud prevention, user request for immediate refund, or account deletion.

### 2.2 User Communication

**Impact: HIGH (user confusion)**

When showing cancellation options, clearly communicate the billing implications of each timing option.

```tsx
function CancelModal() {
  const { currentSubscription } = useBilling()
  const endDate = currentSubscription?.currentPeriodEnd

  return (
    <div>
      <h2>Cancel Subscription</h2>
      <div>
        <button onClick={() => handleCancel('at_end_of_current_billing_period')}>
          Cancel at End of Billing Period
        </button>
        <p>
          You'll keep access until {formatDate(endDate)}.
          No further charges will occur.
        </p>
      </div>
      <div>
        <button onClick={() => handleCancel('immediately')}>
          Cancel Immediately
        </button>
        <p>
          Access ends now. You may be eligible for a prorated refund.
        </p>
      </div>
    </div>
  )
}
```

---

## 3. Upgrade vs Downgrade Behavior

**Impact: HIGH**

Upgrades and downgrades have different default behaviors. Not understanding this leads to incorrect UI and user confusion.

### 3.1 Immediate Upgrades

**Impact: HIGH (billing timing)**

By default, upgrades apply immediately with prorated billing. Communicate this clearly.

```tsx
function UpgradeButton({ targetPriceSlug }: { targetPriceSlug: string }) {
  const { adjustSubscription, reload, getPrice } = useBilling()
  const price = getPrice(targetPriceSlug)

  return (
    <div>
      <button onClick={async () => {
        await adjustSubscription({ priceSlug: targetPriceSlug })
        await reload()
      }}>
        Upgrade Now to {price?.product.name}
      </button>
      <p>
        Your new plan starts immediately.
        You'll be charged a prorated amount for the remainder of this billing period.
      </p>
    </div>
  )
}
```

### 3.2 Deferred Downgrades

**Impact: HIGH (user expectation mismatch)**

Downgrades typically apply at the end of the current billing period. Users keep their current plan until then.

```tsx
function DowngradeButton({ targetPriceSlug }: { targetPriceSlug: string }) {
  const { adjustSubscription, currentSubscription, reload, getPrice } = useBilling()
  const price = getPrice(targetPriceSlug)
  const endDate = currentSubscription?.currentPeriodEnd

  return (
    <div>
      <button onClick={async () => {
        await adjustSubscription({ priceSlug: targetPriceSlug })
        await reload()
      }}>
        Downgrade to {price?.product.name}
      </button>
      <p>
        You'll keep your current plan until {formatDate(endDate)}.
        Your new plan starts on your next billing date.
      </p>
    </div>
  )
}
```

---

## 4. Reactivation with uncancelSubscription

**Impact: MEDIUM**

A subscription canceled with `at_end_of_current_billing_period` can be reactivated until the period ends. Use `uncancelSubscription` — do not create a new checkout session, which would result in overlapping subscriptions.

```tsx
function ReactivateButton() {
  const { currentSubscription, uncancelSubscription, reload } = useBilling()
  const [isLoading, setIsLoading] = useState(false)

  const isPendingCancel = currentSubscription?.cancelAtPeriodEnd
  if (!isPendingCancel) return null

  const handleReactivate = async () => {
    setIsLoading(true)
    try {
      await uncancelSubscription({ id: currentSubscription.id })
      await reload()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <p>Your subscription is set to cancel on {formatDate(currentSubscription.currentPeriodEnd)}</p>
      <button onClick={handleReactivate} disabled={isLoading}>
        {isLoading ? 'Reactivating...' : 'Keep My Subscription'}
      </button>
    </div>
  )
}
```

Note: Reactivation only works for subscriptions canceled with `at_end_of_current_billing_period`. Immediately canceled subscriptions cannot be reactivated this way.

---

## 5. Trial Status Detection

**Impact: MEDIUM**

Detect trial subscriptions via `currentSubscription.status === 'trialing'` and show targeted UI (days remaining, payment method prompts, expiration warnings). See [PATTERNS.md](./PATTERNS.md#trial-status-detection) for complete trial detection and expiration warning examples.

---

## 6. Subscription Status Display

**Impact: MEDIUM**

### Status Mapping

Map raw status values (e.g., `past_due`) to user-friendly labels. See [PATTERNS.md](./PATTERNS.md#status-mapping) for the full `STATUS_LABELS` mapping and component example.

### Pending Cancellation Display

When a subscription is set to cancel at period end, the status is still `active` but users need to know cancellation is pending.

```tsx
function SubscriptionCard() {
  const { currentSubscription, uncancelSubscription, reload, loaded } = useBilling()

  if (!loaded) return <LoadingSkeleton />
  if (!currentSubscription) return null

  const isPendingCancel = currentSubscription.cancelAtPeriodEnd

  return (
    <div>
      <h3>{currentSubscription.product.name}</h3>
      {isPendingCancel ? (
        <div>
          <p style={{ color: 'orange' }}>
            Cancels on {formatDate(currentSubscription.currentPeriodEnd)}
          </p>
          <button onClick={async () => {
            await uncancelSubscription({ id: currentSubscription.id })
            await reload()
          }}>
            Keep Subscription
          </button>
        </div>
      ) : (
        <p style={{ color: 'green' }}>
          Active - Renews on {formatDate(currentSubscription.currentPeriodEnd)}
        </p>
      )}
    </div>
  )
}
```

---

## Quick Reference

### Common Subscription Methods

```typescript
// Cancel subscription
await billing.cancelSubscription({
  id: billing.currentSubscription.id,
  cancellation: { timing: 'at_end_of_current_billing_period' }, // or 'immediately'
})

// Change plan
await billing.adjustSubscription({
  priceSlug: 'enterprise-monthly',
})

// Reactivate canceled subscription
await billing.uncancelSubscription({
  id: subscription.id,
})

// Always reload after mutations
await billing.reload()
```

### Key Subscription Properties

```typescript
const {
  currentSubscription,  // Active subscription object
  loaded,               // Whether billing data has loaded
  reload,               // Function to refresh billing state
} = useBilling()

// Subscription object properties
currentSubscription.status           // 'active', 'trialing', 'past_due', etc.
currentSubscription.cancelAtPeriodEnd // true if cancellation is pending
currentSubscription.currentPeriodEnd  // When current period ends
currentSubscription.trialEnd          // When trial ends (if trialing)
currentSubscription.product           // Associated product
```
