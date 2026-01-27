---
name: flowglad-subscriptions
description: Manage subscription lifecycle including cancellation, plan changes, reactivation, and status display. Use this skill when users need to upgrade, downgrade, cancel, or reactivate subscriptions.
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

## Abstract

This skill covers subscription lifecycle management including cancellation, plan changes, reactivation, trial handling, and status display. Proper subscription management ensures users can upgrade, downgrade, cancel, and reactivate subscriptions with correct billing behavior.

---

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
   - 4.1 [Reactivating Canceled Subscriptions](#41-reactivating-canceled-subscriptions)
5. [Trial Status Detection](#5-trial-status-detection) — **MEDIUM**
   - 5.1 [Checking Trial Status](#51-checking-trial-status)
   - 5.2 [Trial Expiration Handling](#52-trial-expiration-handling)
6. [Subscription Status Display](#6-subscription-status-display) — **MEDIUM**
   - 6.1 [Status Mapping](#61-status-mapping)
   - 6.2 [Pending Cancellation Display](#62-pending-cancellation-display)

---

## 1. Reload After Mutations

**Impact: CRITICAL**

After any subscription mutation (cancel, upgrade, downgrade, reactivate), the local billing state is stale. Failing to reload causes UI to show outdated subscription information.

### 1.1 Client-Side State Sync

**Impact: CRITICAL (users see incorrect subscription status)**

When using `useBilling()` on the client, mutations update the server but the local state remains stale until explicitly reloaded.

**Incorrect: assumes state updates automatically**

```tsx
function CancelButton() {
  const { cancelSubscription, currentSubscription } = useBilling()

  const handleCancel = async () => {
    await cancelSubscription({
      id: currentSubscription.id,
      cancellation: { timing: 'at_end_of_current_billing_period' },
    })
    // BUG: currentSubscription still shows old status!
    // UI will not reflect cancellation until page refresh
  }

  return (
    <div>
      <button onClick={handleCancel}>Cancel Subscription</button>
      {/* Shows incorrect status because we didn't reload */}
      <p>Status: {currentSubscription?.status}</p>
    </div>
  )
}
```

The UI continues showing the old subscription status because the local `useBilling()` state wasn't refreshed.

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
      {/* Now shows correct status after reload */}
      <p>Status: {currentSubscription?.status}</p>
    </div>
  )
}
```

### 1.2 Server-Side Reload Pattern

**Impact: CRITICAL (server actions may return stale data)**

When performing mutations server-side and returning billing data to the client, you must fetch fresh data after the mutation.

**Incorrect: returns stale billing data**

```typescript
// Server action
export async function upgradeSubscription(priceSlug: string) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()

  await billing.adjustSubscription({ priceSlug })

  // BUG: billing object still has old data!
  return {
    success: true,
    subscription: billing.currentSubscription, // Stale!
  }
}
```

**Correct: fetch fresh billing after mutation**

```typescript
// Server action
export async function upgradeSubscription(priceSlug: string) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()

  await billing.adjustSubscription({ priceSlug })

  // Fetch fresh billing state after mutation
  const freshBilling = await flowglad(session.user.id).getBilling()

  return {
    success: true,
    subscription: freshBilling.currentSubscription, // Fresh!
  }
}
```

---

## 2. Cancel Timing Options

**Impact: HIGH**

Flowglad supports two cancellation timing modes. Using the wrong mode leads to billing disputes and poor user experience.

### 2.1 End of Period vs Immediate

**Impact: HIGH (billing and access implications)**

Most SaaS applications should cancel at the end of the billing period to let users keep access for time they've paid for.

**Incorrect: immediately cancels without understanding impact**

```typescript
async function handleCancel() {
  await billing.cancelSubscription({
    id: billing.currentSubscription.id,
    // This immediately ends access!
    // User loses features they already paid for
    cancellation: { timing: 'immediately' },
  })
}
```

Immediate cancellation removes access right away, even if the user paid for the full month. This often leads to support tickets and refund requests.

**Correct: cancel at end of period (default for most cases)**

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

When showing cancellation options, clearly communicate what each timing option means.

**Incorrect: vague cancellation UI**

```tsx
function CancelModal() {
  return (
    <div>
      <h2>Cancel Subscription</h2>
      <button onClick={() => handleCancel('immediately')}>
        Cancel Now
      </button>
      <button onClick={() => handleCancel('at_end_of_current_billing_period')}>
        Cancel Later
      </button>
    </div>
  )
}
```

"Cancel Now" and "Cancel Later" don't explain the billing implications.

**Correct: clear communication of timing**

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

By default, upgrades apply immediately with prorated billing. Users get instant access to the new plan.

**Incorrect: suggests upgrade happens later**

```tsx
function UpgradeButton({ targetPriceSlug }: { targetPriceSlug: string }) {
  const { adjustSubscription, reload } = useBilling()

  return (
    <button onClick={async () => {
      await adjustSubscription({ priceSlug: targetPriceSlug })
      await reload()
    }}>
      {/* Misleading: upgrade happens immediately, not next month */}
      Upgrade Starting Next Month
    </button>
  )
}
```

**Correct: communicate immediate effect**

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

**Incorrect: implies immediate downgrade**

```tsx
function DowngradeButton({ targetPriceSlug }: { targetPriceSlug: string }) {
  const { adjustSubscription, reload } = useBilling()

  return (
    <button onClick={async () => {
      await adjustSubscription({ priceSlug: targetPriceSlug })
      await reload()
    }}>
      {/* Misleading: downgrade doesn't happen immediately */}
      Switch to Basic Now
    </button>
  )
}
```

**Correct: communicate deferred effect**

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

Users who cancel can reactivate their subscription before the cancellation takes effect. This must be handled with the correct API.

### 4.1 Reactivating Canceled Subscriptions

**Impact: MEDIUM (reactivation flow)**

A subscription canceled with `at_end_of_current_billing_period` can be reactivated until the period ends.

**Incorrect: tries to reactivate by creating new checkout**

```tsx
function ReactivateButton() {
  const { currentSubscription, createCheckoutSession } = useBilling()

  // Subscription is set to cancel at period end
  const isPendingCancel = currentSubscription?.cancelAtPeriodEnd

  if (!isPendingCancel) return null

  return (
    <button onClick={async () => {
      // WRONG: Creates a new subscription instead of reactivating
      // User may end up with overlapping subscriptions
      await createCheckoutSession({
        priceSlug: 'pro-monthly',
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      })
    }}>
      Reactivate Subscription
    </button>
  )
}
```

**Correct: use uncancelSubscription**

```tsx
function ReactivateButton() {
  const { currentSubscription, uncancelSubscription, reload } = useBilling()
  const [isLoading, setIsLoading] = useState(false)

  // Subscription is set to cancel at period end
  const isPendingCancel = currentSubscription?.cancelAtPeriodEnd

  if (!isPendingCancel) return null

  const handleReactivate = async () => {
    setIsLoading(true)
    try {
      await uncancelSubscription({
        id: currentSubscription.id,
      })
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

Users on trial subscriptions have different needs than paying subscribers. Proper trial detection enables targeted UI and messaging.

### 5.1 Checking Trial Status

**Impact: MEDIUM (trial-specific UI)**

**Incorrect: ignores trial status**

```tsx
function SubscriptionBanner() {
  const { currentSubscription } = useBilling()

  if (!currentSubscription) {
    return <p>No active subscription</p>
  }

  // Doesn't distinguish between trial and paid
  return <p>You're on the {currentSubscription.product.name} plan</p>
}
```

**Correct: check trial status**

```tsx
function SubscriptionBanner() {
  const { currentSubscription, loaded } = useBilling()

  if (!loaded) return <LoadingSkeleton />

  if (!currentSubscription) {
    return <p>No active subscription</p>
  }

  const isOnTrial = currentSubscription.status === 'trialing'
  const trialEnd = currentSubscription.trialEnd

  if (isOnTrial && trialEnd) {
    const daysLeft = Math.ceil(
      (new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )

    return (
      <div>
        <p>You're on a free trial of {currentSubscription.product.name}</p>
        <p>{daysLeft} days remaining</p>
        <button>Add Payment Method</button>
      </div>
    )
  }

  return <p>You're on the {currentSubscription.product.name} plan</p>
}
```

### 5.2 Trial Expiration Handling

**Impact: MEDIUM (conversion flow)**

**Incorrect: no trial expiration warning**

```tsx
function Dashboard() {
  // User's trial expires silently, they lose access unexpectedly
  return <MainContent />
}
```

**Correct: warn before trial expires**

```tsx
function Dashboard() {
  const { currentSubscription } = useBilling()

  const isOnTrial = currentSubscription?.status === 'trialing'
  const trialEnd = currentSubscription?.trialEnd

  const showTrialWarning = isOnTrial && trialEnd && (() => {
    const daysLeft = Math.ceil(
      (new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    return daysLeft <= 3
  })()

  return (
    <div>
      {showTrialWarning && (
        <TrialExpirationBanner
          trialEnd={trialEnd}
          onUpgrade={() => {/* navigate to upgrade */}}
        />
      )}
      <MainContent />
    </div>
  )
}
```

---

## 6. Subscription Status Display

**Impact: MEDIUM**

Subscriptions have multiple statuses. Displaying them clearly helps users understand their billing state.

### 6.1 Status Mapping

**Impact: MEDIUM (user understanding)**

**Incorrect: shows raw status values**

```tsx
function SubscriptionStatus() {
  const { currentSubscription } = useBilling()

  // Raw status values confuse users
  return <span>Status: {currentSubscription?.status}</span>
  // Shows: "past_due" - not user-friendly
}
```

**Correct: map to user-friendly labels**

```tsx
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'green' },
  trialing: { label: 'Trial', color: 'blue' },
  past_due: { label: 'Payment Failed', color: 'red' },
  canceled: { label: 'Canceled', color: 'gray' },
  incomplete: { label: 'Setup Required', color: 'yellow' },
  incomplete_expired: { label: 'Expired', color: 'gray' },
  paused: { label: 'Paused', color: 'yellow' },
  unpaid: { label: 'Unpaid', color: 'red' },
}

function SubscriptionStatus() {
  const { currentSubscription, loaded } = useBilling()

  if (!loaded) return <LoadingSkeleton />
  if (!currentSubscription) return null

  const status = STATUS_LABELS[currentSubscription.status] ?? {
    label: currentSubscription.status,
    color: 'gray',
  }

  return (
    <span style={{ color: status.color }}>
      Status: {status.label}
    </span>
  )
}
```

### 6.2 Pending Cancellation Display

**Impact: MEDIUM (cancellation clarity)**

When a subscription is set to cancel at period end, the status is still "active" but users need to know cancellation is pending.

**Incorrect: doesn't show pending cancellation**

```tsx
function SubscriptionCard() {
  const { currentSubscription } = useBilling()

  return (
    <div>
      <h3>{currentSubscription?.product.name}</h3>
      {/* Status shows "Active" even though cancellation is pending */}
      <p>Status: {currentSubscription?.status}</p>
    </div>
  )
}
```

**Correct: show pending cancellation state**

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
