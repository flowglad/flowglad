---
name: flowglad-pricing-ui
description: "Build pricing pages, pricing cards, and plan displays with Flowglad. Use this skill when creating pricing tables, displaying subscription options, or building plan comparison interfaces."
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-02-24T21:27:00Z
source_files:
  - platform/docs/features/prices.mdx
  - platform/docs/features/pricing-models.mdx
  - platform/docs/sdks/pricing-models-products.mdx
  - platform/docs/sdks/react.mdx
-->

# Flowglad Pricing UI

## Quick Start

Minimal complete pricing page with loading state, product filtering, and price formatting:

```tsx
import { useBilling } from '@flowglad/nextjs'

function PricingPage() {
  const billing = useBilling()

  if (!billing.loaded) return <PricingPageSkeleton />
  if (billing.errors || !billing.pricingModel) return <div>Unable to load pricing.</div>

  const plans = billing.pricingModel.products
    .filter((p) => !p.default && p.prices.some((pr) => pr.type === 'subscription' && pr.active))
    .map((product) => {
      const price = product.prices.find((p) => p.type === 'subscription' && p.active)!
      return (
        <article key={product.slug} className="border rounded-lg p-6">
          <h3>{product.name}</h3>
          <p className="text-3xl font-bold">${(price.unitPrice / 100).toFixed(2)}/{price.intervalUnit}</p>
          <ul>{product.features.filter((f) => f.name).map((f) => <li key={f.id}>{f.name}</li>)}</ul>
        </article>
      )
    })

  return <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{plans}</div>
}
```

For public (unauthenticated) pages, use `usePricingModel()` instead of `useBilling()`.

---

## Implementation Workflow

1. Set up loading states (check `billing.loaded` before rendering)
2. Filter products (exclude default/free tier, require active prices)
3. Build pricing cards (format cents to dollars, show billing interval, list features)
4. Add current plan detection (compare price IDs, disable checkout for current plan)
5. Test with both authenticated (`useBilling`) and public (`usePricingModel`) contexts

---

## Table of Contents

1. [Loading States](#1-loading-states) -- **CRITICAL**
2. [Accessing Pricing Data](#2-accessing-pricing-data) -- **HIGH**
3. [Building Pricing Cards](#3-building-pricing-cards) -- **MEDIUM**
4. [Current Plan Highlighting](#4-current-plan-highlighting) -- **MEDIUM**
5. [Billing Interval Toggle](#5-billing-interval-toggle) -- **MEDIUM**
6. [Responsive Layout](#6-responsive-layout) -- **LOW**

Helper functions (`formatPriceFromCents`, `formatSubscriptionPrice`, `transformProductsToPricingPlans`, `isPlanCurrent`) are in [HELPERS.md](./HELPERS.md).

---

## 1. Loading States

**Impact: CRITICAL**

### 1.1 Wait for pricingModel Before Rendering

**Impact: CRITICAL (prevents flash of incorrect content)**

Always check that billing data has loaded before rendering pricing UI.

**Incorrect:**

```tsx
function PricingPage() {
  const billing = useBilling()
  // BUG: pricingModel is undefined while loading - renders empty grid then re-renders
  const products = billing.pricingModel?.products ?? []
  return (
    <div className="pricing-grid">
      {products.map((product) => <PricingCard key={product.id} product={product} />)}
    </div>
  )
}
```

**Correct:**

```tsx
function PricingPage() {
  const billing = useBilling()

  if (!billing.loaded || billing.errors || !billing.pricingModel) {
    return <PricingPageSkeleton />
  }

  const { products } = billing.pricingModel

  return (
    <div className="pricing-grid">
      {products.map((product) => <PricingCard key={product.id} product={product} />)}
    </div>
  )
}
```

### 1.2 Public Pricing Pages with usePricingModel

**Impact: CRITICAL (enables unauthenticated pricing pages)**

For public pricing pages, use `usePricingModel()` instead of `useBilling()`. It returns pricing data without requiring authentication.

```tsx
import { usePricingModel } from '@flowglad/nextjs'

function PublicPricingPage() {
  const pricingModel = usePricingModel()
  if (!pricingModel) return <PricingPageSkeleton />

  return (
    <div className="pricing-grid">
      {pricingModel.products.map((product) => {
        const defaultPrice = product.defaultPrice ?? product.prices?.[0]
        return (
          <article key={product.slug}>
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            {defaultPrice && (
              <p>
                ${(defaultPrice.unitPrice / 100).toFixed(2)}
                {defaultPrice.intervalUnit && `/${defaultPrice.intervalUnit}`}
              </p>
            )}
          </article>
        )
      })}
    </div>
  )
}
```

**When to use each hook:**

- `useBilling()` -- Authenticated pages needing subscription status, checkout, or user-specific data
- `usePricingModel()` -- Public pricing pages, marketing sites, or plan display without auth

---

## 2. Accessing Pricing Data

**Impact: HIGH**

### 2.1 Use getProduct and getPrice Helpers

**Impact: HIGH (prevents runtime errors, cleaner code)**

Use `billing.getProduct()` and `billing.getPrice()` for slug-based lookups instead of manual array searches.

**Incorrect:**

```tsx
// Fragile: searches across all products manually
const targetPrice = billing.pricingModel?.products
  .flatMap((p) => p.prices)
  .find((price) => price.slug === targetPriceSlug)
```

**Correct:**

```tsx
const targetPrice = billing.getPrice(targetPriceSlug)
const product = billing.getProduct(productSlug)
```

### 2.2 Filter Products for Display

**Impact: HIGH (shows only relevant products)**

Filter out default/free products and those without active prices.

```tsx
const displayProducts = billing.pricingModel.products.filter((product) => {
  if (product.default === true) return false
  return product.prices.some(
    (price) => price.type === 'subscription' && price.active === true
  )
})
```

For a full transformation to UI-friendly `PricingPlan[]` format, see `transformProductsToPricingPlans` in [HELPERS.md](./HELPERS.md).

---

## 3. Building Pricing Cards

**Impact: MEDIUM**

### 3.1 Format Prices from Cents

**Impact: MEDIUM (prevents displaying wrong amounts)**

Flowglad stores prices in cents. Always convert for display.

**Incorrect:**

```tsx
// BUG: Shows "$1000" instead of "$10.00"
return <span>${price.unitPrice}</span>
```

**Correct:**

```tsx
return <span>${(price.unitPrice / 100).toFixed(2)}</span>
```

See `formatPriceFromCents` in [HELPERS.md](./HELPERS.md) for a reusable helper with locale support.

### 3.2 Display Billing Interval

**Impact: MEDIUM (clarifies subscription terms)**

Always show the billing interval alongside the price amount.

```tsx
function PriceDisplay({ price }: { price: SubscriptionPrice }) {
  const amount = (price.unitPrice / 100).toFixed(2)
  let intervalLabel = ''
  if (price.intervalUnit) {
    intervalLabel = price.intervalCount === 1
      ? `/${price.intervalUnit}`
      : ` every ${price.intervalCount} ${price.intervalUnit}s`
  }
  return <span>${amount}{intervalLabel}</span>
}
```

See `formatSubscriptionPrice` in [HELPERS.md](./HELPERS.md) for a standalone helper.

### 3.3 Extract and Display Features

**Impact: MEDIUM (shows value proposition)**

Filter to features with valid names before rendering.

```tsx
function FeatureList({ product }: { product: Product }) {
  const displayFeatures = product.features.filter(
    (f): f is Feature & { name: string } =>
      typeof f.name === 'string' && f.name.length > 0
  )
  if (displayFeatures.length === 0) return null

  return (
    <ul>
      {displayFeatures.map((f) => <li key={f.id}>{f.name}</li>)}
    </ul>
  )
}
```

---

## 4. Current Plan Highlighting

**Impact: MEDIUM**

### 4.1 Detect Current Subscription

**Impact: MEDIUM (helps users understand their status)**

Compare price IDs, not product names, to detect the current plan.

**Incorrect:**

```tsx
// BUG: Product names might not be unique or might change
return billing.currentSubscription?.product?.name === product.name
```

**Correct:** Use `isPlanCurrent` from [HELPERS.md](./HELPERS.md), which compares price IDs via `billing.getPrice()` and `billing.currentSubscriptions`.

### 4.2 Disable or Style Current Plan

**Impact: MEDIUM (prevents confusing interactions)**

Disable the checkout button for the user's current plan.

```tsx
function PricingCard({ plan, isCurrentPlan }: { plan: PricingPlan; isCurrentPlan: boolean }) {
  const billing = useBilling()
  const [isLoading, setIsLoading] = useState(false)

  const handleUpgrade = async () => {
    if (isCurrentPlan || isLoading) return
    setIsLoading(true)
    try {
      await billing.createCheckoutSession({
        priceSlug: plan.slug,
        successUrl: `${window.location.origin}/dashboard?upgraded=true`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={isCurrentPlan ? 'border-primary' : ''}>
      <h3>{plan.name}</h3>
      <p>{plan.displayPrice}</p>
      <button
        onClick={handleUpgrade}
        disabled={isCurrentPlan || isLoading}
        className={isCurrentPlan ? 'opacity-50 cursor-not-allowed' : ''}
      >
        {isCurrentPlan ? 'Current Plan' : isLoading ? 'Loading...' : 'Get Started'}
      </button>
    </div>
  )
}
```

---

## 5. Billing Interval Toggle

**Impact: MEDIUM**

### 5.1 Monthly/Annual Toggle Pattern

```tsx
type BillingInterval = 'month' | 'year'

function PricingPage() {
  const billing = useBilling()
  const [interval, setInterval] = useState<BillingInterval>('month')

  if (!billing.loaded || !billing.pricingModel) return <PricingPageSkeleton />

  return (
    <div>
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setInterval('month')}
          className={interval === 'month' ? 'bg-primary' : 'bg-gray-200'}
        >Monthly</button>
        <button
          onClick={() => setInterval('year')}
          className={interval === 'year' ? 'bg-primary' : 'bg-gray-200'}
        >Annual</button>
      </div>
      <PricingGrid interval={interval} pricingModel={billing.pricingModel} />
    </div>
  )
}
```

### 5.2 Filter Prices by Interval

Match prices to the selected billing interval when rendering the grid.

```tsx
function PricingGrid({ interval, pricingModel }: { interval: BillingInterval; pricingModel: PricingModel }) {
  const plans = pricingModel.products
    .filter((product) => !product.default)
    .map((product) => {
      const price = product.prices.find(
        (p) => p.type === 'subscription' && p.active && p.intervalUnit === interval && (p.intervalCount === 1 || p.intervalCount === undefined)
      )
      if (!price) return null
      return { product, price, displayPrice: formatSubscriptionPrice(price) }
    })
    .filter(Boolean)

  return (
    <div className="grid grid-cols-3 gap-4">
      {plans.map(({ product, price, displayPrice }) => (
        <PricingCard key={product.id} name={product.name} description={product.description} price={displayPrice} priceSlug={price.slug} features={product.features} />
      ))}
    </div>
  )
}
```

---

## 6. Responsive Layout

**Impact: LOW**

Use CSS grid with responsive breakpoints. Center cards when fewer than 3 plans.

```tsx
function PricingGrid({ plans }: { plans: PricingPlan[] }) {
  const gridClass = plans.length <= 2
    ? 'flex flex-wrap justify-center gap-6'
    : 'grid gap-6 md:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={gridClass}>
      {plans.map((plan) => (
        <div key={plan.slug} className="w-full md:max-w-sm rounded-lg border p-6">
          <h3 className="text-xl font-semibold">{plan.name}</h3>
          <p className="text-3xl font-bold my-4">{plan.displayPrice}</p>
          <ul className="space-y-2 mb-6">
            {plan.features.map((feature, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-green-500" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <button className="w-full py-2 px-4 bg-primary text-white rounded">Get Started</button>
        </div>
      ))}
    </div>
  )
}
```

---

## References

1. [Flowglad Documentation](https://docs.flowglad.com)
2. [Flowglad React SDK](https://github.com/flowglad/flowglad)
