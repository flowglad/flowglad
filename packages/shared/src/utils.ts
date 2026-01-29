import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type {
  FeatureItem,
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
    featureItems?: FeatureItem[]
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

    const featureItems = subscription.featureItems
      ?? subscription.experimental?.featureItems
      ?? []

    const featureItemsBySlug =
      featureItems.reduce(
        (
          acc: Record<string, FeatureItem>,
          featureItem: FeatureItem
        ) => {
          if (featureItem.type === 'toggle') {
            acc[featureItem.slug] = featureItem
          }
          return acc
        },
        {} as Record<string, FeatureItem>
      )
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
  pricingModel: FlowgladNode.CustomerRetrieveBillingResponse['pricingModel']
) => {
  const productsBySlug = new Map(
    pricingModel.products.map((product) => [product.slug, product])
  )
  const getProduct = (productSlug: string) => {
    return productsBySlug.get(productSlug) ?? null
  }
  return getProduct
}

export const constructGetPrice = (
  pricingModel: FlowgladNode.CustomerRetrieveBillingResponse['pricingModel']
) => {
  type Price =
    FlowgladNode.CustomerRetrieveBillingResponse['pricingModel']['products'][number]['prices'][number]

  // Collect all prices from products (includes subscription, single payment, and usage prices)
  const allPrices: Array<readonly [string | null, Price]> =
    pricingModel.products.flatMap((product) =>
      product.prices.map((price) => [price.slug, price] as const)
    )

  const pricesBySlug = new Map<string | null, Price>(allPrices)

  const getPrice = (priceSlug: string): Price | null => {
    return pricesBySlug.get(priceSlug) ?? null
  }
  return getPrice
}

export const constructHasPurchased = (
  pricingModel: FlowgladNode.CustomerRetrieveBillingResponse['pricingModel'],
  purchases: FlowgladNode.CustomerRetrieveBillingResponse['purchases']
) => {
  const productsBySlug = new Map(
    pricingModel.products.map((product) => [product.slug, product])
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
