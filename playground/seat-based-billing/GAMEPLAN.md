# Seat-Based Billing Playground Gameplan

## Project Name
`seat-billing-playground`

## Problem Statement
The seat-based-billing playground currently has a complex multi-tier pricing model with usage meters that don't match the pricing.yaml, making it unsuitable as a reference implementation for seat-based billing. We need a simple, working example that demonstrates how customers can select a number of seats at checkout, manage seat assignments via claim/release, and adjust their seat count via adjustSubscription.

## Solution Summary
Simplify the playground to a single paid tier (Pro) with resource-based seat tracking. The customer selects quantity at checkout, which determines their seat capacity. After subscribing, they can claim seats for team members (tracked via externalId), release seats when members leave, and use adjustSubscription to increase or decrease their seat limit. The UI will show current seat usage and provide forms for seat management.

## Current State Analysis

### Pricing Model (pricing.yaml)
- Complex 4-tier structure (Free, Basic, Business, Enterprise) with monthly/yearly variants
- 29 toggle features defined
- `singularQuantityLabel`/`pluralQuantityLabel` present but no resources defined
- `usageMeters: []` - empty

### Home Page (home-client.tsx)
- References usage meters (`fast_generations`, `hd_video_minutes`) that don't exist in pricing.yaml
- No seat management UI
- No resource-related functionality

### Server Actions
- None exist - no seat-actions.ts or similar

### FlowgladServer (flowglad.ts)
- Configured with organization as customer type
- Falls back to user lookup
- Base URL hardcoded to localhost

### Database Schema
- `organizations` and `members` tables exist via BetterAuth
- No seat-specific tables (resources are tracked in Flowglad, not locally)

## Required Changes

### 1. Simplify pricing.yaml
Replace the current complex model with:
- One resource: `seats`
- One resource feature: `seats` with `amount: 1` (1 seat per subscription unit)
- Two products: Free (default, no seats) and Pro ($10/seat/month)
- Pro product has `singularQuantityLabel: "seat"` and `pluralQuantityLabel: "seats"`

### 2. Create seat-actions.ts
New file: `src/lib/seat-actions.ts`

```ts
'use server'

export const claimSeat = async (
  email: string,
  metadata?: Record<string, unknown>
): Promise<{ claims: ResourceClaim[]; usage: ResourceUsage }>

export const releaseSeat = async (
  email: string
): Promise<{ usage: ResourceUsage }>

export const getSeats = async (): Promise<{
  resources: ResourceUsage[]
}>

export const listSeatClaims = async (): Promise<{
  claims: ResourceClaim[]
}>

export const adjustSeatCount = async (
  newQuantity: number
): Promise<{ subscription: Subscription }>
```

### 3. Update home-client.tsx
Replace usage meter demo with seat management UI:
- Display current seat usage (claimed/available/capacity)
- List of claimed seats (team members)
- Form to invite/claim a seat for an email
- Button to release a seat
- Form to adjust seat count (upgrade/downgrade)

### 4. Update pricing page
Modify `pricing-cards-grid.tsx` and `pricing-card.tsx`:
- Add quantity selector for Pro plan
- Pass quantity to `createCheckoutSession`

### 5. Simplify billing-helpers.ts
Remove usage meter helpers that are no longer needed, or leave them as they don't hurt.

## Acceptance Criteria

- [ ] pricing.yaml has exactly 2 products: Free (default) and Pro ($10/seat/month)
- [ ] pricing.yaml defines a `seats` resource and resource feature with `amount: 1`
- [ ] Pricing page shows Pro plan with a quantity selector (1-100 seats)
- [ ] Checkout creates subscription with selected quantity
- [ ] Home page shows seat capacity, claimed count, and available count
- [ ] Home page lists all claimed seats with email and claim date
- [ ] User can claim a seat by entering an email address
- [ ] User can release a seat, freeing capacity
- [ ] User can adjust seat count via a form that calls adjustSubscription
- [ ] Adjusting seat count down is blocked if it would go below claimed count
- [ ] Free plan users are redirected to pricing page (existing behavior)

## Open Questions

1. **Should we show a "Manage Subscription" link to Stripe portal, or handle everything in-app?**
   - Recommendation: Handle seat adjustment in-app, link to portal for billing/payment method changes

2. **Should claimed seats persist across subscription adjustments?**
   - Yes, the Flowglad resource system preserves claims. Adjustments that would orphan claims are rejected.

3. **How should we identify seat holders - by email or by member ID?**
   - Recommendation: Use email as `externalId` for simplicity and to support inviting users not yet in the system

## Explicit Opinions

1. **Use email as externalId for seat claims.** This allows claiming seats for people who haven't signed up yet (invitation flow), and matches common seat-based billing patterns.

2. **Single product tier (Pro) to minimize complexity.** The goal is a clear reference implementation, not a production-ready pricing model. Additional tiers can be added later as examples.

3. **Keep resource feature amount at 1.** This gives a direct 1:1 mapping between subscription quantity and seat capacity, making the math obvious (quantity 5 = 5 seats).

4. **Use adjustSubscription for seat count changes, not new checkout sessions.** This preserves the existing subscription, handles proration correctly, and maintains claim state.

5. **Don't build local seat tracking database tables.** Flowglad's resource system is the source of truth. We query it via getResources and listResourceClaims.

## Patches

### Patch 1: Simplify pricing.yaml

**Files to modify:**
- `playground/seat-based-billing/pricing.yaml` - Replace entirely

**Changes:**
Create a minimal pricing model with:
```yaml
isDefault: false
name: "Seat-Based Billing Demo"

resources:
  - slug: "seats"
    name: "Team Seats"
    active: true

features:
  - type: "resource"
    slug: "seat_allocation"
    name: "Team Seats"
    description: "Seats for team members"
    resourceSlug: "seats"
    amount: 1
    active: true

products:
  - product:
      name: "Free"
      description: "Try it out - no seats included"
      active: true
      default: true
      slug: "free"
    price:
      intervalUnit: "month"
      name: "Free Plan"
      intervalCount: 1
      type: "subscription"
      isDefault: true
      unitPrice: 0
      active: true
      slug: "free_monthly"
    features: []

  - product:
      name: "Pro"
      description: "$10 per seat per month"
      active: true
      default: false
      slug: "pro"
      singularQuantityLabel: "seat"
      pluralQuantityLabel: "seats"
    price:
      intervalUnit: "month"
      name: "Pro Plan"
      intervalCount: 1
      type: "subscription"
      isDefault: true
      unitPrice: 1000
      active: true
      slug: "pro_monthly"
    features:
      - "seat_allocation"

usageMeters: []
```

**Test Cases:**
```ts
describe('pricing.yaml validation', () => {
  it('should have exactly 2 products: Free and Pro', async () => {
    // setup: load pricing.yaml
    // expect: products.length === 2
    // expect: products include slugs 'free' and 'pro'
  })

  it('should define seats resource with amount: 1', async () => {
    // setup: load pricing.yaml
    // expect: resources includes { slug: 'seats' }
    // expect: features includes { type: 'resource', resourceSlug: 'seats', amount: 1 }
  })

  it('should have quantity labels on Pro product', async () => {
    // setup: load pricing.yaml
    // expect: Pro product has singularQuantityLabel: 'seat'
    // expect: Pro product has pluralQuantityLabel: 'seats'
  })
})
```

---

### Patch 2: Create seat server actions

**Files to create:**
- `playground/seat-based-billing/src/lib/seat-actions.ts`

**Changes:**
Create server actions that wrap FlowgladServer resource methods:

```ts
'use server'

import { flowglad } from './flowglad'
import { auth } from './auth'
import { headers } from 'next/headers'

// Helper to get current organization ID
async function getCustomerExternalId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.session?.activeOrganizationId) {
    throw new Error('No active organization')
  }
  return session.session.activeOrganizationId
}

export async function claimSeat(email: string, metadata?: Record<string, unknown>) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.claimResource({
    resourceSlug: 'seats',
    externalId: email,
    metadata,
  })
}

export async function releaseSeat(email: string) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.releaseResource({
    resourceSlug: 'seats',
    externalId: email,
  })
}

export async function getSeats() {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.getResources()
}

export async function listSeatClaims() {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.listResourceClaims({ resourceSlug: 'seats' })
}

export async function adjustSeatCount(newQuantity: number) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)

  // Get current subscription to find the price
  const billing = await client.billing()
  const currentSub = billing.currentSubscriptions?.[0]
  if (!currentSub) {
    throw new Error('No active subscription')
  }

  return client.adjustSubscription({
    subscriptionId: currentSub.id,
    adjustment: {
      timing: 'Immediately',
      newSubscriptionItems: [{
        priceSlug: 'pro_monthly',
        quantity: newQuantity,
      }],
    },
  })
}
```

**Test Cases:**
```ts
describe('seat-actions', () => {
  describe('claimSeat', () => {
    it('should claim a seat for a valid email when capacity is available', async () => {
      // setup: create org with Pro subscription (quantity: 5), 0 seats claimed
      // action: claimSeat('user@example.com')
      // expect: returns claim with externalId 'user@example.com'
      // expect: usage shows claimed: 1, available: 4, capacity: 5
    })

    it('should fail when no capacity is available', async () => {
      // setup: create org with Pro subscription (quantity: 1), 1 seat already claimed
      // action: claimSeat('another@example.com')
      // expect: throws error containing 'No available capacity'
    })

    it('should fail when email already has a claim', async () => {
      // setup: create org with Pro subscription, claim seat for 'user@example.com'
      // action: claimSeat('user@example.com') again
      // expect: throws error (duplicate claim)
    })
  })

  describe('releaseSeat', () => {
    it('should release a claimed seat', async () => {
      // setup: create org with claimed seat for 'user@example.com'
      // action: releaseSeat('user@example.com')
      // expect: usage shows one more available seat
    })

    it('should fail when email has no claim', async () => {
      // setup: create org with no claims
      // action: releaseSeat('nobody@example.com')
      // expect: throws error (no claim found)
    })
  })

  describe('adjustSeatCount', () => {
    it('should increase seat capacity', async () => {
      // setup: create org with Pro subscription (quantity: 5)
      // action: adjustSeatCount(10)
      // expect: subscription quantity is 10
      // expect: resource capacity is 10
    })

    it('should decrease seat capacity when claims allow', async () => {
      // setup: create org with Pro subscription (quantity: 5), 2 seats claimed
      // action: adjustSeatCount(3)
      // expect: subscription quantity is 3
      // expect: resource capacity is 3, claimed: 2, available: 1
    })

    it('should fail to decrease below claimed count', async () => {
      // setup: create org with Pro subscription (quantity: 5), 4 seats claimed
      // action: adjustSeatCount(2)
      // expect: throws error containing 'Cannot reduce' and '4 resources are currently claimed'
    })
  })
})
```

---

### Patch 3: Update pricing page with quantity selector

**Files to modify:**
- `playground/seat-based-billing/src/components/pricing-card.tsx`
- `playground/seat-based-billing/src/components/pricing-cards-grid.tsx`

**Changes to pricing-card.tsx:**
1. Add `quantity` state (default: 1)
2. Add quantity selector UI (input with +/- buttons) for non-free plans
3. Display calculated total price (unitPrice × quantity)
4. Pass quantity to `createCheckoutSession`

```tsx
// Add to PricingCard component
const [quantity, setQuantity] = useState(1)

// In render, for non-free plans:
<div className="flex items-center gap-2">
  <Button size="sm" onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</Button>
  <span className="w-12 text-center">{quantity}</span>
  <Button size="sm" onClick={() => setQuantity(Math.min(100, quantity + 1))}>+</Button>
  <span className="text-sm text-muted-foreground">
    {product.pluralQuantityLabel ?? 'units'}
  </span>
</div>

// Update checkout call:
await billing.createCheckoutSession({
  priceSlug: price.slug,
  quantity,  // <-- Add this
  successUrl: `${window.location.origin}/`,
  cancelUrl: `${window.location.origin}/pricing`,
  autoRedirect: true,
})
```

**Test Cases:**
```ts
describe('PricingCard', () => {
  it('should show quantity selector for non-free plans', async () => {
    // setup: render PricingCard with Pro plan
    // expect: quantity selector is visible
    // expect: initial quantity is 1
  })

  it('should not show quantity selector for free plan', async () => {
    // setup: render PricingCard with Free plan
    // expect: quantity selector is not visible
  })

  it('should update displayed total when quantity changes', async () => {
    // setup: render PricingCard with Pro plan ($10/seat)
    // action: change quantity to 5
    // expect: displayed price shows $50/month (or similar)
  })

  it('should pass quantity to createCheckoutSession', async () => {
    // setup: render PricingCard, set quantity to 3
    // action: click checkout button
    // expect: createCheckoutSession called with quantity: 3
  })
})
```

---

### Patch 4: Replace home page with seat management UI

**Files to modify:**
- `playground/seat-based-billing/src/app/home-client.tsx`

**Changes:**
Replace the usage meter demo with a seat management dashboard:

1. **Seat Usage Card**: Shows capacity, claimed, available with progress bar
2. **Team Members List**: Table of claimed seats (email, claimed date, release button)
3. **Invite Member Form**: Input for email + "Add Seat" button
4. **Adjust Seats Form**: Number input + "Update" button to change subscription quantity

```tsx
// Key state:
const [seats, setSeats] = useState<ResourceUsage | null>(null)
const [claims, setClaims] = useState<ResourceClaim[]>([])
const [inviteEmail, setInviteEmail] = useState('')
const [newQuantity, setNewQuantity] = useState(1)
const [isLoading, setIsLoading] = useState(true)

// Key actions:
const handleClaimSeat = async () => {
  await claimSeat(inviteEmail)
  await refreshData()
}

const handleReleaseSeat = async (email: string) => {
  await releaseSeat(email)
  await refreshData()
}

const handleAdjustSeats = async () => {
  await adjustSeatCount(newQuantity)
  await billing.reload()
  await refreshData()
}
```

**UI Structure:**
```
┌─────────────────────────────────────┐
│  Current Plan: Pro                  │
│  Seats: 3/5 used (2 available)      │
│  [=========     ] 60%               │
├─────────────────────────────────────┤
│  Team Members                       │
│  ┌─────────────────────────────┐    │
│  │ alice@co.com    [Release]   │    │
│  │ bob@co.com      [Release]   │    │
│  │ carol@co.com    [Release]   │    │
│  └─────────────────────────────┘    │
│                                     │
│  [email input    ] [Add Member]     │
├─────────────────────────────────────┤
│  Adjust Seat Count                  │
│  Current: 5 seats                   │
│  New: [  5  ] [-] [+]               │
│  [Update Subscription]              │
└─────────────────────────────────────┘
```

**Test Cases:**
```ts
describe('HomeClient - Seat Management', () => {
  describe('seat usage display', () => {
    it('should show current seat capacity, claimed, and available', async () => {
      // setup: org with 5 seat capacity, 3 claimed
      // expect: UI shows "3/5 seats used" or similar
      // expect: progress bar at 60%
    })

    it('should show empty state when no seats claimed', async () => {
      // setup: org with 5 seat capacity, 0 claimed
      // expect: UI shows "0/5 seats used"
      // expect: team members list shows empty state
    })
  })

  describe('claim seat', () => {
    it('should add a team member when claiming seat', async () => {
      // setup: render with available seats
      // action: enter email, click Add Member
      // expect: new member appears in list
      // expect: available count decreases by 1
    })

    it('should show error when no seats available', async () => {
      // setup: render with 0 available seats
      // action: try to add member
      // expect: error message displayed
    })
  })

  describe('release seat', () => {
    it('should remove team member and free up seat', async () => {
      // setup: render with claimed seats
      // action: click Release on a member
      // expect: member removed from list
      // expect: available count increases by 1
    })
  })

  describe('adjust seat count', () => {
    it('should update subscription and seat capacity', async () => {
      // setup: render with 5 seats
      // action: change to 10, click Update
      // expect: capacity shows 10
      // expect: subscription updated
    })

    it('should prevent reducing below claimed count', async () => {
      // setup: render with 5 seats, 4 claimed
      // action: try to reduce to 2
      // expect: error message about claimed seats
    })
  })
})
```

---

### Patch 5: Cleanup and polish

**Files to modify:**
- `playground/seat-based-billing/src/lib/billing-helpers.ts` - Remove or keep (no functional change needed)
- `playground/seat-based-billing/src/components/pricing-cards-grid.tsx` - Simplify for single product

**Changes:**
1. Simplify pricing-cards-grid to handle the simpler product structure
2. Update any hardcoded plan names (e.g., "Team" as popular plan)
3. Ensure proper loading states and error handling
4. Add helpful comments explaining the seat-based billing pattern

**Test Cases:**
```ts
describe('End-to-end seat billing flow', () => {
  it('should complete full flow: checkout -> claim -> release -> adjust', async () => {
    // setup: new organization, no subscription
    // action 1: go to pricing, select 5 seats, checkout
    // expect: subscription created with quantity 5
    // action 2: claim 3 seats
    // expect: 3 claimed, 2 available
    // action 3: release 1 seat
    // expect: 2 claimed, 3 available
    // action 4: adjust to 3 seats
    // expect: capacity 3, claimed 2, available 1
    // action 5: try to adjust to 1 seat
    // expect: error (2 claimed)
  })
})
```

## Dependency Graph

```
- Patch 1 -> []
- Patch 2 -> [1]
- Patch 3 -> [1]
- Patch 4 -> [1, 2]
- Patch 5 -> [3, 4]
```

**Parallelization:**
- Patch 1 must be done first (pricing.yaml is foundation)
- Patches 2 and 3 can be done in parallel after Patch 1
- Patch 4 depends on both 1 and 2 (needs pricing model and server actions)
- Patch 5 is final cleanup after UI patches are done
