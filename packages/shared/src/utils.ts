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
  return (
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
}

export const constructCheckUsageBalance = (
  subscriptions: {
    id: string
    experimental?: SubscriptionExperimentalFields
  }[]
) => {
  return (
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
  const pricesBySlug = new Map(
    catalog.products.flatMap((product) =>
      product.prices.map((price) => [price.slug, price])
    )
  )
  const getPrice = (priceSlug: string) => {
    return pricesBySlug.get(priceSlug) ?? null
  }
  return getPrice
}
