---
name: flowglad-pricing-ui
description: Build pricing pages, pricing cards, and plan displays with Flowglad. Use this skill when creating pricing tables, displaying subscription options, or building plan comparison interfaces.
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/features/prices.mdx
  - platform/docs/features/pricing-models.mdx
  - platform/docs/sdks/pricing-models-products.mdx
  - platform/docs/sdks/react.mdx
-->

# Flowglad Pricing UI

## Abstract

Comprehensive guide for building pricing pages, pricing cards, and plan displays with Flowglad. Covers loading states, accessing pricing data through helper functions, formatting prices correctly, highlighting current subscriptions, implementing billing interval toggles, and responsive layout patterns.

---

## Table of Contents

1. [Loading States](#1-loading-states) — **CRITICAL**
   - 1.1 [Wait for pricingModel Before Rendering](#11-wait-for-pricingmodel-before-rendering)
   - 1.2 [Public Pricing Pages with usePricingModel](#12-public-pricing-pages-with-usepricingmodel)
2. [Accessing Pricing Data](#2-accessing-pricing-data) — **HIGH**
   - 2.1 [Use getProduct and getPrice Helpers](#21-use-getproduct-and-getprice-helpers)
   - 2.2 [Filter Products for Display](#22-filter-products-for-display)
3. [Building Pricing Cards](#3-building-pricing-cards) — **MEDIUM**
   - 3.1 [Format Prices from Cents](#31-format-prices-from-cents)
   - 3.2 [Display Billing Interval](#32-display-billing-interval)
   - 3.3 [Extract and Display Features](#33-extract-and-display-features)
4. [Current Plan Highlighting](#4-current-plan-highlighting) — **MEDIUM**
   - 4.1 [Detect Current Subscription](#41-detect-current-subscription)
   - 4.2 [Disable or Style Current Plan](#42-disable-or-style-current-plan)
5. [Billing Interval Toggle](#5-billing-interval-toggle) — **MEDIUM**
   - 5.1 [Monthly/Annual Toggle Pattern](#51-monthlyannual-toggle-pattern)
   - 5.2 [Filter Prices by Interval](#52-filter-prices-by-interval)
6. [Responsive Layout](#6-responsive-layout) — **LOW**
   - 6.1 [Grid Layout for Pricing Cards](#61-grid-layout-for-pricing-cards)

---

## 1. Loading States

**Impact: CRITICAL**

The pricing model loads asynchronously. Rendering before data is available causes visual flicker, incorrect UI states, or hydration mismatches.

### 1.1 Wait for pricingModel Before Rendering

**Impact: CRITICAL (prevents flash of incorrect content)**

Always check that billing data has loaded before rendering pricing UI. The `pricingModel` is `null` or `undefined` until the billing data loads.

**Incorrect: renders empty or broken UI while loading**

```tsx
function PricingPage() {
  const billing = useBilling()

  // BUG: pricingModel is undefined while loading!
  // This renders empty pricing grid, then re-renders when data arrives
  const products = billing.pricingModel?.products ?? []

  return (
    <div className="pricing-grid">
      {products.map((product) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

Users see an empty pricing page that suddenly fills in, causing layout shift and poor UX.

**Correct: show loading state until data is ready**

```tsx
function PricingPage() {
  const billing = useBilling()

  // Wait for billing to load
  if (!billing.loaded) {
    return <PricingPageSkeleton />
  }

  // Handle error state
  if (billing.errors) {
    return <div>Unable to load pricing. Please try again.</div>
  }

  // Now safe to access pricingModel
  const products = billing.pricingModel?.products ?? []

  return (
    <div className="pricing-grid">
      {products.map((product) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

**Alternative: early return pattern**

```tsx
function PricingPage() {
  const billing = useBilling()

  if (!billing.loaded || billing.errors || !billing.pricingModel) {
    return <PricingPageSkeleton />
  }

  // TypeScript now knows pricingModel is defined
  const { products } = billing.pricingModel

  return (
    <div className="pricing-grid">
      {products.map((product) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

### 1.2 Public Pricing Pages with usePricingModel

**Impact: CRITICAL (enables unauthenticated pricing pages)**

For public pricing pages that don't require authentication, use the `usePricingModel()` hook instead of `useBilling()`. This returns only the pricing data without requiring a logged-in user.

**Incorrect: uses useBilling for public page**

```tsx
// Public pricing page - no user logged in
function PublicPricingPage() {
  // BUG: useBilling requires authentication context
  // Will fail or return empty data for unauthenticated users
  const billing = useBilling()

  if (!billing.loaded) return <div>Loading...</div>

  return <PricingDisplay products={billing.pricingModel?.products} />
}
```

**Correct: uses usePricingModel for public pages**

```tsx
import { usePricingModel } from '@flowglad/nextjs'

function PublicPricingPage() {
  // Works without authentication
  const pricingModel = usePricingModel()

  // Returns null while loading
  if (!pricingModel) {
    return <PricingPageSkeleton />
  }

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

- `useBilling()` - Authenticated pages where you need subscription status, checkout, or user-specific data
- `usePricingModel()` - Public pricing pages, marketing sites, or anywhere you just need to display plans

---

## 2. Accessing Pricing Data

**Impact: HIGH**

Flowglad provides helper functions to access products and prices by slug. Using these helpers is more reliable than manual array lookups.

### 2.1 Use getProduct and getPrice Helpers

**Impact: HIGH (prevents runtime errors, cleaner code)**

The billing object provides `getProduct()` and `getPrice()` helper functions that look up items by slug. Use these instead of manually searching arrays.

**Incorrect: manual array lookup**

```tsx
function UpgradeButton({ targetPriceSlug }: { targetPriceSlug: string }) {
  const billing = useBilling()

  if (!billing.loaded) return null

  // Fragile: searches across all products, easy to get wrong
  const targetPrice = billing.pricingModel?.products
    .flatMap((p) => p.prices)
    .find((price) => price.slug === targetPriceSlug)

  if (!targetPrice) return null

  return <button>Upgrade to {targetPrice.name}</button>
}
```

**Correct: use getPrice helper**

```tsx
function UpgradeButton({ targetPriceSlug }: { targetPriceSlug: string }) {
  const billing = useBilling()

  if (!billing.loaded) return null

  // Clean: helper does the lookup efficiently
  const targetPrice = billing.getPrice(targetPriceSlug)

  if (!targetPrice) return null

  return <button>Upgrade to {targetPrice.name}</button>
}
```

**Same pattern for products:**

```tsx
function ProductFeatures({ productSlug }: { productSlug: string }) {
  const billing = useBilling()

  if (!billing.loaded) return null

  // Use getProduct helper
  const product = billing.getProduct(productSlug)

  if (!product) return null

  return (
    <ul>
      {product.features.map((feature) => (
        <li key={feature.id}>{feature.name}</li>
      ))}
    </ul>
  )
}
```

### 2.2 Filter Products for Display

**Impact: HIGH (shows only relevant products)**

Not all products should appear on pricing pages. Filter out default/free products and products without active prices.

**Incorrect: displays all products including internal ones**

```tsx
function PricingGrid() {
  const billing = useBilling()

  if (!billing.loaded || !billing.pricingModel) return null

  // BUG: Shows ALL products, including free tier and inactive products
  return (
    <div>
      {billing.pricingModel.products.map((product) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

**Correct: filter to displayable products**

```tsx
function PricingGrid() {
  const billing = useBilling()

  if (!billing.loaded || !billing.pricingModel) return null

  // Filter products for display
  const displayProducts = billing.pricingModel.products.filter((product) => {
    // Skip default/free tier products
    if (product.default === true) return false

    // Only show products with active subscription prices
    const hasActivePrice = product.prices.some(
      (price) => price.type === 'subscription' && price.active === true
    )

    return hasActivePrice
  })

  return (
    <div>
      {displayProducts.map((product) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

**Transform to UI-friendly format:**

```tsx
interface PricingPlan {
  name: string
  description?: string
  displayPrice: string
  slug: string
  features: string[]
  unitPrice: number
}

function transformProductsToPricingPlans(
  pricingModel: PricingModel | null | undefined
): PricingPlan[] {
  if (!pricingModel?.products) return []

  return pricingModel.products
    .filter((product) => {
      if (product.default === true) return false
      return product.prices.some(
        (p) => p.type === 'subscription' && p.active === true
      )
    })
    .map((product) => {
      const price = product.prices.find(
        (p) => p.type === 'subscription' && p.active === true
      )

      if (!price?.slug) return null

      return {
        name: product.name,
        description: product.description,
        displayPrice: `$${(price.unitPrice / 100).toFixed(2)}`,
        slug: price.slug,
        features: product.features.map((f) => f.name).filter(Boolean),
        unitPrice: price.unitPrice,
      }
    })
    .filter((plan): plan is PricingPlan => plan !== null)
    .sort((a, b) => a.unitPrice - b.unitPrice)
}
```

---

## 3. Building Pricing Cards

**Impact: MEDIUM**

Pricing cards display product information with proper formatting. Getting price formatting and interval display right is essential for clear communication.

### 3.1 Format Prices from Cents

**Impact: MEDIUM (prevents displaying wrong amounts)**

Flowglad stores prices in cents (e.g., 1000 = $10.00). Always convert to dollars for display.

**Incorrect: displays cents as dollars**

```tsx
function PriceDisplay({ price }: { price: Price }) {
  // BUG: Shows "$1000" instead of "$10.00"
  return <span>${price.unitPrice}</span>
}
```

**Correct: convert cents to dollars**

```tsx
function PriceDisplay({ price }: { price: Price }) {
  const dollars = (price.unitPrice / 100).toFixed(2)
  return <span>${dollars}</span>
}
```

**Helper function for consistent formatting:**

```tsx
function formatPriceFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// Usage
function PriceDisplay({ price }: { price: Price }) {
  return <span>{formatPriceFromCents(price.unitPrice)}</span>
}
```

**With locale-aware formatting:**

```tsx
function formatPriceFromCents(
  cents: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100)
}
```

### 3.2 Display Billing Interval

**Impact: MEDIUM (clarifies subscription terms)**

Subscription prices have `intervalUnit` (day, month, year) and `intervalCount` properties. Display these clearly.

**Incorrect: ignores billing interval**

```tsx
function PriceDisplay({ price }: { price: SubscriptionPrice }) {
  // Confusing: Is this $10 total? Per month? Per year?
  return <span>${(price.unitPrice / 100).toFixed(2)}</span>
}
```

**Correct: shows billing interval**

```tsx
function PriceDisplay({ price }: { price: SubscriptionPrice }) {
  const amount = (price.unitPrice / 100).toFixed(2)

  // Format interval display
  let intervalLabel = ''
  if (price.intervalUnit) {
    if (price.intervalCount === 1) {
      intervalLabel = `/${price.intervalUnit}`
    } else {
      intervalLabel = ` every ${price.intervalCount} ${price.intervalUnit}s`
    }
  }

  return (
    <span>
      ${amount}
      {intervalLabel}
    </span>
  )
}

// Renders: "$10.00/month" or "$99.00/year" or "$5.00 every 2 weeks"
```

**Helper function:**

```tsx
function formatSubscriptionPrice(price: SubscriptionPrice): string {
  const amount = (price.unitPrice / 100).toFixed(2)

  if (!price.intervalUnit) {
    return `$${amount}`
  }

  if (price.intervalCount === 1) {
    return `$${amount}/${price.intervalUnit}`
  }

  return `$${amount} every ${price.intervalCount} ${price.intervalUnit}s`
}
```

### 3.3 Extract and Display Features

**Impact: MEDIUM (shows value proposition)**

Products have a `features` array. Extract and display feature names in pricing cards.

**Incorrect: doesn't handle missing feature names**

```tsx
function FeatureList({ product }: { product: Product }) {
  return (
    <ul>
      {product.features.map((feature) => (
        // BUG: feature.name might be undefined
        <li key={feature.id}>{feature.name}</li>
      ))}
    </ul>
  )
}
```

**Correct: filter to features with names**

```tsx
function FeatureList({ product }: { product: Product }) {
  // Filter to features that have names
  const displayFeatures = product.features.filter(
    (feature): feature is Feature & { name: string } =>
      typeof feature.name === 'string' && feature.name.length > 0
  )

  if (displayFeatures.length === 0) {
    return null
  }

  return (
    <ul>
      {displayFeatures.map((feature) => (
        <li key={feature.id}>{feature.name}</li>
      ))}
    </ul>
  )
}
```

---

## 4. Current Plan Highlighting

**Impact: MEDIUM**

When displaying pricing to authenticated users, highlight which plan they're currently on to help them understand their options.

### 4.1 Detect Current Subscription

**Impact: MEDIUM (helps users understand their status)**

Use the current subscription's price ID to determine which pricing card represents the user's current plan.

**Incorrect: compares product names (unreliable)**

```tsx
function isPlanCurrent(product: Product, billing: LoadedBillingContext) {
  // BUG: Product names might not be unique, or might change
  return billing.currentSubscription?.product?.name === product.name
}
```

**Correct: compares price IDs**

```tsx
function isPlanCurrent(priceSlug: string, billing: LoadedBillingContext) {
  // No current subscription = no current plan
  if (!billing.currentSubscriptions?.length) {
    return false
  }

  // Get the price by slug
  const price = billing.getPrice(priceSlug)
  if (!price) {
    return false
  }

  // Check if any current subscription uses this price
  const currentPriceIds = new Set(
    billing.currentSubscriptions.map((sub) => sub.priceId)
  )

  return currentPriceIds.has(price.id)
}
```

**Usage in a component:**

```tsx
function PricingCard({
  plan,
  isCurrentPlan,
}: {
  plan: PricingPlan
  isCurrentPlan: boolean
}) {
  return (
    <div className={isCurrentPlan ? 'border-primary' : 'border-gray-200'}>
      <h3>{plan.name}</h3>
      <p>{plan.displayPrice}</p>
      {isCurrentPlan && <span className="badge">Current Plan</span>}
    </div>
  )
}

function PricingGrid() {
  const billing = useBilling()

  if (!billing.loaded || !billing.pricingModel) return null

  const plans = transformProductsToPricingPlans(billing.pricingModel)

  return (
    <div className="grid grid-cols-3 gap-4">
      {plans.map((plan) => (
        <PricingCard
          key={plan.slug}
          plan={plan}
          isCurrentPlan={isPlanCurrent(plan.slug, billing)}
        />
      ))}
    </div>
  )
}
```

### 4.2 Disable or Style Current Plan

**Impact: MEDIUM (prevents confusing interactions)**

The "current plan" card should not have an active checkout button. Either disable or restyle the action.

**Incorrect: same button for all plans**

```tsx
function PricingCard({ plan }: { plan: PricingPlan }) {
  const billing = useBilling()

  const handleUpgrade = async () => {
    // BUG: Allows clicking to "upgrade" to current plan
    await billing.createCheckoutSession({
      priceSlug: plan.slug,
      successUrl: window.location.origin,
      cancelUrl: window.location.href,
      autoRedirect: true,
    })
  }

  return (
    <div>
      <h3>{plan.name}</h3>
      <button onClick={handleUpgrade}>Get Started</button>
    </div>
  )
}
```

**Correct: disable button for current plan**

```tsx
function PricingCard({
  plan,
  isCurrentPlan,
}: {
  plan: PricingPlan
  isCurrentPlan: boolean
}) {
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

Many pricing pages let users toggle between monthly and annual billing to compare options.

### 5.1 Monthly/Annual Toggle Pattern

**Impact: MEDIUM (improves comparison shopping)**

Implement a toggle that filters prices by billing interval.

**Basic implementation:**

```tsx
type BillingInterval = 'month' | 'year'

function PricingPage() {
  const billing = useBilling()
  const [interval, setInterval] = useState<BillingInterval>('month')

  if (!billing.loaded || !billing.pricingModel) {
    return <PricingPageSkeleton />
  }

  return (
    <div>
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setInterval('month')}
          className={interval === 'month' ? 'bg-primary' : 'bg-gray-200'}
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval('year')}
          className={interval === 'year' ? 'bg-primary' : 'bg-gray-200'}
        >
          Annual
        </button>
      </div>

      <PricingGrid interval={interval} pricingModel={billing.pricingModel} />
    </div>
  )
}
```

### 5.2 Filter Prices by Interval

**Impact: MEDIUM (shows correct prices for selected interval)**

When displaying prices, filter to only show prices matching the selected billing interval.

**Incorrect: shows all prices regardless of interval**

```tsx
function PricingGrid({
  interval,
  pricingModel,
}: {
  interval: BillingInterval
  pricingModel: PricingModel
}) {
  return (
    <div>
      {pricingModel.products.map((product) => {
        // BUG: Shows first price regardless of interval selection
        const price = product.prices[0]

        return (
          <PricingCard key={product.id} product={product} price={price} />
        )
      })}
    </div>
  )
}
```

**Correct: filter prices by interval**

```tsx
function PricingGrid({
  interval,
  pricingModel,
}: {
  interval: BillingInterval
  pricingModel: PricingModel
}) {
  const plans = pricingModel.products
    .filter((product) => !product.default)
    .map((product) => {
      // Find the price matching the selected interval
      const price = product.prices.find(
        (p) =>
          p.type === 'subscription' &&
          p.active === true &&
          p.intervalUnit === interval &&
          (p.intervalCount === 1 || p.intervalCount === undefined)
      )

      if (!price) return null

      return {
        product,
        price,
        displayPrice: formatSubscriptionPrice(price),
      }
    })
    .filter(Boolean)

  return (
    <div className="grid grid-cols-3 gap-4">
      {plans.map(({ product, price, displayPrice }) => (
        <PricingCard
          key={product.id}
          name={product.name}
          description={product.description}
          price={displayPrice}
          priceSlug={price.slug}
          features={product.features}
        />
      ))}
    </div>
  )
}
```

---

## 6. Responsive Layout

**Impact: LOW**

Pricing grids should adapt to different screen sizes for optimal viewing.

### 6.1 Grid Layout for Pricing Cards

**Impact: LOW (improves mobile experience)**

Use CSS grid with responsive breakpoints to adjust the number of columns.

**Basic responsive grid:**

```tsx
function PricingGrid({ plans }: { plans: PricingPlan[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {plans.map((plan) => (
        <PricingCard key={plan.slug} plan={plan} />
      ))}
    </div>
  )
}
```

**Centered layout for fewer plans:**

```tsx
function PricingGrid({ plans }: { plans: PricingPlan[] }) {
  // Center cards when fewer than 3 plans
  const gridClass =
    plans.length <= 2
      ? 'flex flex-wrap justify-center gap-6'
      : 'grid gap-6 md:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={gridClass}>
      {plans.map((plan) => (
        <PricingCard key={plan.slug} plan={plan} />
      ))}
    </div>
  )
}
```

**Full-width cards on mobile:**

```tsx
function PricingCard({ plan }: { plan: PricingPlan }) {
  return (
    <div className="w-full md:max-w-sm rounded-lg border p-6">
      <h3 className="text-xl font-semibold">{plan.name}</h3>
      <p className="text-3xl font-bold my-4">{plan.displayPrice}</p>

      <ul className="space-y-2 mb-6">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 text-green-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button className="w-full py-2 px-4 bg-primary text-white rounded">
        Get Started
      </button>
    </div>
  )
}
```

---

## References

1. [Flowglad Documentation](https://docs.flowglad.com)
2. [Flowglad React SDK](https://github.com/flowglad/flowglad)
