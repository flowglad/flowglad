# Flowglad Pricing UI - Helper Functions Reference

Reusable helper functions for formatting and transforming Flowglad pricing data.

## formatPriceFromCents

Converts cents to a formatted dollar string. Supports locale-aware formatting.

```tsx
// Basic
function formatPriceFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// Locale-aware
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

## formatSubscriptionPrice

Formats a subscription price with its billing interval.

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

// Renders: "$10.00/month" or "$99.00/year" or "$5.00 every 2 weeks"
```

## transformProductsToPricingPlans

Filters and transforms raw product data into a UI-friendly format, sorted by price.

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

## isPlanCurrent

Checks whether a given price slug matches the user's current subscription.

```tsx
function isPlanCurrent(priceSlug: string, billing: LoadedBillingContext) {
  if (!billing.currentSubscriptions?.length) {
    return false
  }

  const price = billing.getPrice(priceSlug)
  if (!price) {
    return false
  }

  const currentPriceIds = new Set(
    billing.currentSubscriptions.map((sub) => sub.priceId)
  )

  return currentPriceIds.has(price.id)
}
```
