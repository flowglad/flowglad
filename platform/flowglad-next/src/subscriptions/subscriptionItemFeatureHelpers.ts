import { Price } from '@/db/schema/prices'
import { Feature } from '@/db/schema/features'
import { DbTransaction } from '@/db/types'
import { ProductFeature } from '@/db/schema/productFeatures'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import {
  SubscriptionItemFeature,
  subscriptionItemFeaturesInsertSchema,
} from '@/db/schema/subscriptionItemFeatures'
import { bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import * as R from 'ramda'
import { FeatureType } from '@/types'

/**
 * Retrieves a map of price IDs to their associated features and productFeatures.
 *
 * @param pricesToFetchFeaturesFor - An array of Price.Record objects.
 * @param transaction - The database transaction.
 * @returns A Promise resolving to a Map where keys are price IDs and values are arrays of { feature: Feature.Record, productFeature: ProductFeature.Record }.
 */
const getFeaturesByPriceId = async (
  pricesToFetchFeaturesFor: Price.Record[],
  transaction: DbTransaction
): Promise<
  Map<
    string,
    Array<{
      feature: Feature.Record
      productFeature: ProductFeature.Record
    }>
  >
> => {
  const result = new Map<
    string,
    Array<{
      feature: Feature.Record
      productFeature: ProductFeature.Record
    }>
  >()
  if (R.isEmpty(pricesToFetchFeaturesFor)) {
    return result
  }

  pricesToFetchFeaturesFor.forEach((price) => {
    result.set(price.id, [])
  })

  const uniqueProductIds: string[] = R.uniq(
    pricesToFetchFeaturesFor.map((p) => p.productId)
  )

  if (R.isEmpty(uniqueProductIds)) {
    return result
  }

  const productFeaturesWhereClause: ProductFeature.Where = {
    productId: uniqueProductIds,
  }
  const productFeaturesWithDetails =
    await selectFeaturesByProductFeatureWhere(
      productFeaturesWhereClause,
      transaction
    )

  const productIdToDataMap = new Map<
    string,
    Array<{
      feature: Feature.Record
      productFeature: ProductFeature.Record
    }>
  >()

  for (const pfWithDetail of productFeaturesWithDetails) {
    const productId = pfWithDetail.productFeature.productId
    if (!productIdToDataMap.has(productId)) {
      productIdToDataMap.set(productId, [])
    }
    productIdToDataMap.get(productId)?.push({
      feature: pfWithDetail.feature as Feature.Record,
      productFeature:
        pfWithDetail.productFeature as ProductFeature.Record,
    })
  }

  for (const price of pricesToFetchFeaturesFor) {
    const dataForProduct = productIdToDataMap.get(price.productId)
    if (dataForProduct) {
      result.set(price.id, dataForProduct)
    }
  }
  return result
}

export const subscriptionItemFeatureInsertFromSubscriptionItemAndFeature =
  (
    subscriptionItem: SubscriptionItem.Record,
    productFeature: ProductFeature.Record,
    feature: Feature.Record
  ): SubscriptionItemFeature.Insert => {
    switch (feature.type) {
      case FeatureType.UsageCreditGrant:
        return {
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          type: FeatureType.UsageCreditGrant,
          livemode: subscriptionItem.livemode,
          usageMeterId: feature.usageMeterId,
          amount: feature.amount,
          renewalFrequency: feature.renewalFrequency,
          productFeatureId: productFeature.id,
          expiredAt: null,
        }
      case FeatureType.Toggle:
        return {
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          type: FeatureType.Toggle,
          livemode: subscriptionItem.livemode,
          usageMeterId: null,
          amount: null,
          renewalFrequency: null,
          productFeatureId: productFeature.id,
          expiredAt: null,
        }
      default:
        throw new Error(
          `Unknown feature type encountered: ${feature}`
        )
    }
  }

/**
 * Creates subscription item features for a list of subscription items.
 * It fetches product features associated with the price of each subscription item
 * and creates corresponding subscription item feature records.
 *
 * @param subscriptionItems - An array of SubscriptionItem.Record objects.
 * @param transaction - The database transaction.
 */
export const createSubscriptionFeatureItems = async (
  subscriptionItems: SubscriptionItem.Record[],
  transaction: DbTransaction
): Promise<SubscriptionItemFeature.Record[]> => {
  if (R.isEmpty(subscriptionItems)) {
    return []
  }

  const uniquePriceIds: string[] = R.uniq(
    subscriptionItems.map((item) => item.priceId)
  )

  if (R.isEmpty(uniquePriceIds)) {
    return []
  }

  const pricesWhereClause: Price.Where = {
    id: uniquePriceIds,
  }
  const pricesFetched = await selectPrices(
    pricesWhereClause,
    transaction
  )

  if (R.isEmpty(pricesFetched)) {
    return []
  }

  const priceIdToFeaturesMap = await getFeaturesByPriceId(
    pricesFetched,
    transaction
  )

  const subscriptionFeatureInserts: SubscriptionItemFeature.Insert[] =
    subscriptionItems.flatMap((item) => {
      const featuresData = priceIdToFeaturesMap.get(item.priceId)

      if (!featuresData || R.isEmpty(featuresData)) {
        return []
      }
      /**
       * TODO: this can potentially create duplicate feature grants if somehow the subscriptions
       * include multiple prices from the same product id.
       * We should find a way to deduplicate those
       */
      return featuresData.flatMap(({ feature, productFeature }) => {
        return subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
          item,
          productFeature,
          feature
        )
      })
    })

  if (!R.isEmpty(subscriptionFeatureInserts)) {
    return await bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId(
      subscriptionFeatureInserts,
      transaction
    )
  }
  return []
}
