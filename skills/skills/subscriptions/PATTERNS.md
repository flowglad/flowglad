# Subscription Patterns Reference

Detailed patterns for subscription status mapping and trial detection. Referenced from [SKILL.md](./SKILL.md).

---

## Status Mapping

Map raw subscription statuses to user-friendly labels and colors:

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

---

## Trial Status Detection

### Checking Trial Status

Distinguish between trial and paid subscriptions to show targeted UI:

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

### Trial Expiration Warning

Show a warning banner when the trial is about to expire (e.g., 3 days or fewer remaining):

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
