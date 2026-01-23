---
name: flowglad-checkout
description: Implement checkout sessions for purchasing subscriptions and products with Flowglad. Use this skill when creating upgrade buttons, purchase flows, or redirecting users to hosted checkout pages.
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/features/checkout-sessions.mdx
  - platform/docs/sdks/checkout-sessions.mdx
-->

# Checkout

## Abstract

This skill covers implementing checkout sessions for purchasing subscriptions and products with Flowglad. It includes creating upgrade buttons, handling redirects to hosted checkout pages, and displaying pricing information from the pricing model.

---

## Table of Contents

1. [Success and Cancel URL Handling](#1-success-and-cancel-url-handling) — **CRITICAL**
   - 1.1 [Use Absolute URLs](#11-use-absolute-urls)
   - 1.2 [Include Post-Checkout Context](#12-include-post-checkout-context)
2. [Price Slug vs Price ID](#2-price-slug-vs-price-id) — **HIGH**
   - 2.1 [Use Slugs for Stability](#21-use-slugs-for-stability)
3. [autoRedirect Behavior](#3-autoredirect-behavior) — **MEDIUM**
   - 3.1 [When to Use autoRedirect](#31-when-to-use-autoredirect)
   - 3.2 [Manual Redirect Control](#32-manual-redirect-control)
4. [Building Upgrade Buttons](#4-building-upgrade-buttons) — **MEDIUM**
   - 4.1 [Loading States During Checkout](#41-loading-states-during-checkout)
   - 4.2 [Disabling During Billing Load](#42-disabling-during-billing-load)
5. [Displaying Pricing from pricingModel](#5-displaying-pricing-from-pricingmodel) — **MEDIUM**
   - 5.1 [Accessing Prices and Products](#51-accessing-prices-and-products)
   - 5.2 [Formatting Price Display](#52-formatting-price-display)

---

## 1. Success and Cancel URL Handling

**Impact: CRITICAL**

Checkout sessions require `successUrl` and `cancelUrl` parameters. These URLs determine where users are redirected after completing or abandoning checkout. Incorrect URL handling causes broken redirects and poor user experience.

### 1.1 Use Absolute URLs

**Impact: CRITICAL (relative URLs will fail)**

Flowglad's hosted checkout redirects users via HTTP redirect, which requires fully-qualified absolute URLs.

**Incorrect: using relative URLs**

```typescript
const handleUpgrade = async () => {
  await createCheckoutSession({
    priceSlug: 'pro-monthly',
    // FAILS: relative URLs don't work with external redirects
    successUrl: '/dashboard?upgraded=true',
    cancelUrl: '/pricing',
    autoRedirect: true,
  })
}
```

Relative URLs cause redirect failures because the hosted checkout page is on a different domain and cannot resolve relative paths.

**Correct: use absolute URLs with window.location.origin**

```typescript
const handleUpgrade = async () => {
  await createCheckoutSession({
    priceSlug: 'pro-monthly',
    successUrl: `${window.location.origin}/dashboard?upgraded=true`,
    cancelUrl: `${window.location.origin}/pricing`,
    autoRedirect: true,
  })
}
```

### 1.2 Include Post-Checkout Context

**Impact: MEDIUM (improves user experience)**

Include query parameters in success URLs to trigger appropriate UI feedback.

**Incorrect: no context after checkout**

```typescript
await createCheckoutSession({
  priceSlug: 'pro-monthly',
  successUrl: `${window.location.origin}/dashboard`,
  cancelUrl: window.location.href,
  autoRedirect: true,
})
```

User returns to dashboard with no indication that checkout succeeded.

**Correct: include success context**

```typescript
await createCheckoutSession({
  priceSlug: 'pro-monthly',
  successUrl: `${window.location.origin}/dashboard?checkout=success&plan=pro`,
  cancelUrl: window.location.href,
  autoRedirect: true,
})

// Then in the dashboard component:
const searchParams = useSearchParams()
const checkoutSuccess = searchParams.get('checkout') === 'success'

{checkoutSuccess && (
  <SuccessBanner>Welcome to Pro! Your subscription is now active.</SuccessBanner>
)}
```

---

## 2. Price Slug vs Price ID

**Impact: HIGH**

Flowglad supports referencing prices by either `priceId` or `priceSlug`. Using slugs provides stability across environments.

### 2.1 Use Slugs for Stability

**Impact: HIGH (IDs differ between environments)**

Price IDs are auto-generated and differ between development, staging, and production environments. Slugs are user-defined and consistent.

**Incorrect: hardcoding price IDs**

```typescript
await createCheckoutSession({
  // This ID only exists in production!
  priceId: 'price_abc123xyz',
  successUrl: `${window.location.origin}/success`,
  cancelUrl: window.location.href,
  autoRedirect: true,
})
```

Code breaks when deployed to different environments because each environment has different price IDs.

**Correct: use price slugs**

```typescript
await createCheckoutSession({
  // Slugs are consistent across all environments
  priceSlug: 'pro-monthly',
  successUrl: `${window.location.origin}/success`,
  cancelUrl: window.location.href,
  autoRedirect: true,
})
```

When using `priceSlug`, ensure the slug is defined in your Flowglad dashboard for all environments. Slugs are case-sensitive.

---

## 3. autoRedirect Behavior

**Impact: MEDIUM**

The `autoRedirect` option controls whether users are automatically sent to the hosted checkout page.

### 3.1 When to Use autoRedirect

**Impact: MEDIUM (simplifies common flows)**

For most checkout buttons, `autoRedirect: true` provides the expected behavior.

**Incorrect: manually redirecting when autoRedirect would suffice**

```typescript
const handleUpgrade = async () => {
  const result = await createCheckoutSession({
    priceSlug: 'pro-monthly',
    successUrl: `${window.location.origin}/success`,
    cancelUrl: window.location.href,
    // Missing autoRedirect
  })

  // Unnecessary manual redirect
  if (result.url) {
    window.location.href = result.url
  }
}
```

**Correct: use autoRedirect for simple flows**

```typescript
const handleUpgrade = async () => {
  await createCheckoutSession({
    priceSlug: 'pro-monthly',
    successUrl: `${window.location.origin}/success`,
    cancelUrl: window.location.href,
    autoRedirect: true,
  })
  // No manual redirect needed - user is automatically sent to checkout
}
```

### 3.2 Manual Redirect Control

**Impact: MEDIUM (needed for analytics or pre-redirect logic)**

Disable autoRedirect when you need to perform actions before redirecting, such as analytics tracking.

**Correct: manual control for analytics**

```typescript
const handleUpgrade = async () => {
  const result = await createCheckoutSession({
    priceSlug: 'pro-monthly',
    successUrl: `${window.location.origin}/success`,
    cancelUrl: window.location.href,
    autoRedirect: false, // Explicitly disable
  })

  if ('url' in result && result.url) {
    // Track checkout initiation before redirect
    await analytics.track('checkout_started', {
      priceSlug: 'pro-monthly',
      checkoutSessionId: result.id,
    })

    // Then manually redirect
    window.location.href = result.url
  }
}
```

---

## 4. Building Upgrade Buttons

**Impact: MEDIUM**

Upgrade buttons must handle loading states and errors gracefully.

### 4.1 Loading States During Checkout

**Impact: MEDIUM (prevents double-clicks and shows feedback)**

Checkout session creation is asynchronous. Buttons should show loading state and be disabled during the request.

**Incorrect: no loading state**

```tsx
function UpgradeButton({ priceSlug }: { priceSlug: string }) {
  const { createCheckoutSession } = useBilling()

  const handleClick = async () => {
    // User can click multiple times while request is pending
    await createCheckoutSession({
      priceSlug,
      successUrl: `${window.location.origin}/success`,
      cancelUrl: window.location.href,
      autoRedirect: true,
    })
  }

  return <button onClick={handleClick}>Upgrade</button>
}
```

**Correct: with loading state**

```tsx
function UpgradeButton({ priceSlug }: { priceSlug: string }) {
  const { createCheckoutSession } = useBilling()
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    try {
      await createCheckoutSession({
        priceSlug,
        successUrl: `${window.location.origin}/success`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      })
    } catch (error) {
      // Handle error (show toast, etc.)
      console.error('Checkout failed:', error)
      setIsLoading(false)
    }
    // Note: don't setIsLoading(false) on success because
    // autoRedirect will navigate away from the page
  }

  return (
    <button onClick={handleClick} disabled={isLoading}>
      {isLoading ? 'Loading...' : 'Upgrade'}
    </button>
  )
}
```

### 4.2 Disabling During Billing Load

**Impact: MEDIUM (prevents errors from undefined methods)**

The `useBilling` hook returns `loaded: false` until billing data is fetched. Checkout methods should not be called before loading completes.

**Incorrect: not checking loaded state**

```tsx
function UpgradeButton({ priceSlug }: { priceSlug: string }) {
  const { createCheckoutSession } = useBilling()

  // createCheckoutSession may throw if called before loaded
  return <button onClick={() => createCheckoutSession({...})}>Upgrade</button>
}
```

**Correct: check loaded state**

```tsx
function UpgradeButton({ priceSlug }: { priceSlug: string }) {
  const { loaded, createCheckoutSession } = useBilling()
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    if (!loaded) return

    setIsLoading(true)
    try {
      await createCheckoutSession({
        priceSlug,
        successUrl: `${window.location.origin}/success`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      })
    } catch (error) {
      console.error('Checkout failed:', error)
      setIsLoading(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={!loaded || isLoading}>
      {!loaded ? 'Loading...' : isLoading ? 'Redirecting...' : 'Upgrade'}
    </button>
  )
}
```

---

## 5. Displaying Pricing from pricingModel

**Impact: MEDIUM**

The `pricingModel` from `useBilling` contains all products, prices, and usage meters configured in your Flowglad dashboard.

### 5.1 Accessing Prices and Products

**Impact: MEDIUM (use helper functions for cleaner code)**

Use the `getPrice` and `getProduct` helper functions instead of manually searching arrays.

**Incorrect: manually searching arrays**

```tsx
function PricingCard({ priceSlug }: { priceSlug: string }) {
  const { pricingModel } = useBilling()

  // Verbose and error-prone
  const price = pricingModel?.prices.find(p => p.slug === priceSlug)
  const product = pricingModel?.products.find(
    p => p.id === price?.productId
  )

  return (
    <div>
      <h3>{product?.name}</h3>
      <p>${price?.unitPrice}</p>
    </div>
  )
}
```

**Correct: use helper functions**

```tsx
function PricingCard({ priceSlug }: { priceSlug: string }) {
  const { loaded, getPrice, getProduct } = useBilling()

  if (!loaded) {
    return <LoadingSkeleton />
  }

  const price = getPrice(priceSlug)
  const product = price ? getProduct(price.productSlug) : null

  if (!price || !product) {
    return null
  }

  return (
    <div>
      <h3>{product.name}</h3>
      <p>${price.unitPrice / 100}/mo</p>
    </div>
  )
}
```

### 5.2 Formatting Price Display

**Impact: MEDIUM (prices are in cents)**

Prices in `pricingModel` are stored in cents (the smallest currency unit). Format for display.

**Incorrect: displaying raw price value**

```tsx
function PriceDisplay({ priceSlug }: { priceSlug: string }) {
  const { getPrice } = useBilling()
  const price = getPrice(priceSlug)

  // Shows "1999" instead of "$19.99"
  return <span>{price?.unitPrice}</span>
}
```

**Correct: format price for display**

```tsx
function PriceDisplay({ priceSlug }: { priceSlug: string }) {
  const { loaded, getPrice } = useBilling()

  if (!loaded) return <span>--</span>

  const price = getPrice(priceSlug)
  if (!price) return <span>--</span>

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency || 'USD',
  }).format(price.unitPrice / 100)

  const interval = price.intervalUnit === 'month' ? '/mo' : '/yr'

  return <span>{formattedPrice}{interval}</span>
}
```

For building complete pricing pages with product cards, monthly/annual toggles, and current plan highlighting, see the `pricing-ui` skill.
