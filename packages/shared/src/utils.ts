import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type {
  SubscriptionExperimentalFields,
  UsageMeterBalance,
} from './types/sdk'

const IS_DEV = process.env.NODE_ENV === 'development'

export const getBaseURL = () => {
  // allow override in dev
  if (IS_DEV && process.env.FLOWGLAD_API_URL_OVERRIDE) {
    return process.env.FLOWGLAD_API_URL_OVERRIDE
  }
  return 'https://app.flowglad.com'
}

export const constructCheckFeatureAccess = (
  subscriptions: {
    id: string
    experimental?: SubscriptionExperimentalFields
  }[]
) => {
  const checkFeatureAccess = (
    featureSlug: string,
    refinementParams?: {
      subscriptionId?: string
    }
  ): boolean => {
    const subscription = refinementParams?.subscriptionId
      ? subscriptions.find(
          (s) => s.id === refinementParams.subscriptionId
        )
      : subscriptions[0]
    if (!subscription) {
      return false
    }
    const experimental = subscription.experimental
    const featureItemsBySlug =
      experimental?.featureItems.reduce(
        (
          acc: Record<
            string,
            SubscriptionExperimentalFields['featureItems'][number]
          >,
          featureItem: SubscriptionExperimentalFields['featureItems'][number]
        ) => {
          if (featureItem.type === 'toggle') {
            acc[featureItem.slug] = featureItem
          }
          return acc
        },
        {} as Record<
          string,
          SubscriptionExperimentalFields['featureItems'][number]
        >
      ) ?? {}
    const featureItem = featureItemsBySlug[featureSlug]
    if (!featureItem) {
      return false
    }
    return featureItem.type === 'toggle'
  }
  return checkFeatureAccess
}

export const constructCheckUsageBalance = (
  subscriptions: {
    id: string
    experimental?: SubscriptionExperimentalFields
  }[]
) => {
  const checkUsageBalance = (
    usageMeterSlug: string,
    refinementParams?: {
      subscriptionId?: string
    }
  ): {
    availableBalance: number
  } | null => {
    const subscription = refinementParams?.subscriptionId
      ? subscriptions.find(
          (s) => s.id === refinementParams.subscriptionId
        )
      : subscriptions[0]
    if (!subscription) {
      return null
    }
    const experimental = subscription.experimental
    const usageMeterBalancesBySlug =
      experimental?.usageMeterBalances.reduce(
        (
          acc: Record<string, UsageMeterBalance>,
          usageMeterBalance: UsageMeterBalance
        ) => {
          acc[usageMeterBalance.slug] = usageMeterBalance
          return acc
        },
        {} as Record<string, UsageMeterBalance>
      ) ?? {}
    const usageMeterBalance = usageMeterBalancesBySlug[usageMeterSlug]
    if (!usageMeterBalance) {
      return null
    }
    return usageMeterBalance
  }
  return checkUsageBalance
}

export const constructGetProduct = (
  catalog: FlowgladNode.CustomerRetrieveBillingResponse['catalog']
) => {
  const productsBySlug = new Map(
    catalog.products.map((product) => [product.slug, product])
  )
  const getProduct = (productSlug: string) => {
    return productsBySlug.get(productSlug) ?? null
  }
  return getProduct
}

export const constructGetPrice = (
  catalog: FlowgladNode.CustomerRetrieveBillingResponse['catalog']
) => {
  type Price =
    FlowgladNode.CustomerRetrieveBillingResponse['catalog']['products'][number]['prices'][number]

  // Collect prices from products (subscription and single payment prices)
  const productPrices: Array<readonly [string | null, Price]> =
    catalog.products.flatMap((product) =>
      product.prices.map((price) => [price.slug, price] as const)
    )

  // Collect prices from usage meters (usage prices)
  // Usage prices are now nested under usageMeters[].prices instead of products
  // Cast needed until @flowglad/node types are regenerated from updated OpenAPI spec
  type UsageMeterWithPrices = {
    prices?: Price[]
  }
  const usageMeterPrices: Array<readonly [string | null, Price]> = (
    catalog.usageMeters as UsageMeterWithPrices[]
  ).flatMap((usageMeter) =>
    (usageMeter.prices ?? []).map(
      (price) => [price.slug, price] as const
    )
  )

  const pricesBySlug = new Map<string | null, Price>([
    ...productPrices,
    ...usageMeterPrices,
  ])

  const getPrice = (priceSlug: string): Price | null => {
    return pricesBySlug.get(priceSlug) ?? null
  }
  return getPrice
}

export const constructHasPurchased = (
  catalog: FlowgladNode.CustomerRetrieveBillingResponse['catalog'],
  purchases: FlowgladNode.CustomerRetrieveBillingResponse['purchases']
) => {
  const productsBySlug = new Map(
    catalog.products.map((product) => [product.slug, product])
  )

  // Create a set of all purchased price IDs for quick lookup
  const purchasedPriceIds = new Set(
    (purchases ?? []).map((purchase) => purchase.priceId)
  )

  /**
   * @experimental
   * Checks if a customer has purchased a specific product, based on the product's slug
   * @param productSlug - The slug of the product to check
   * @returns True if the customer has purchased the product, false otherwise
   */
  const hasPurchased = (productSlug: string): boolean => {
    const product = productsBySlug.get(productSlug)

    if (!product) {
      return false
    }

    // Check if any of the product's prices have been purchased
    return product.prices.some((price) =>
      purchasedPriceIds.has(price.id)
    )
  }

  return hasPurchased
}
