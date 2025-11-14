import { Price } from '@/db/schema/prices'
import { Feature } from '@/db/schema/features'
import { DbTransaction } from '@/db/types'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { ProductFeature } from '@/db/schema/productFeatures'
import {
  selectFeaturesByProductFeatureWhere,
  selectProductFeatures,
} from '@/db/tableMethods/productFeatureMethods'
import {
  selectPriceById,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import {
  AddFeatureToSubscriptionInput,
  SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import {
  bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId,
  insertSubscriptionItemFeature,
  selectSubscriptionItemFeatures,
  updateSubscriptionItemFeature,
  upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectSubscriptionItemById } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import {
  FeatureType,
  LedgerTransactionType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { Product } from '@/db/schema/products'
import { CreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import * as R from 'ramda'

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
          amount: feature.amount * subscriptionItem.quantity,
          renewalFrequency: feature.renewalFrequency,
          productFeatureId: productFeature.id,
          expiredAt: null,
          detachedAt: null,
          detachedReason: null,
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
          detachedAt: null,
          detachedReason: null,
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
       * FIXME: this can potentially create duplicate feature grants if somehow the subscriptions
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

const ensureSubscriptionItemIsActive = (
  subscriptionItem: SubscriptionItem.Record
) => {
  if (subscriptionItem.expiredAt !== null) {
    throw new Error(
      `Subscription item ${subscriptionItem.id} is expired and cannot accept new features.`
    )
  }
}

const ensureFeatureIsEligible = (feature: Feature.Record) => {
  if (!feature.active) {
    throw new Error(
      `Feature ${feature.id} is inactive and cannot be added to subscriptions.`
    )
  }
}

const ensureOrganizationAndLivemodeMatch = ({
  subscription,
  subscriptionItem,
  feature,
}: {
  subscription: Subscription.Record
  subscriptionItem: SubscriptionItem.Record
  feature: Feature.Record
}) => {
  if (subscription.organizationId !== feature.organizationId) {
    throw new Error(
      `Feature ${feature.id} does not belong to the same organization as subscription ${subscription.id}.`
    )
  }
  if (subscriptionItem.livemode !== feature.livemode) {
    throw new Error(
      'Feature livemode does not match subscription item livemode.'
    )
  }
  if (subscription.livemode !== feature.livemode) {
    throw new Error(
      'Feature livemode does not match subscription livemode.'
    )
  }
}

const ensureFeatureBelongsToProductPricingModel = ({
  product,
  feature,
}: {
  product: Product.Record
  feature: Feature.Record
}) => {
  if (product.pricingModelId !== feature.pricingModelId) {
    throw new Error(
      `Feature ${feature.id} does not belong to the same pricing model as product ${product.id}.`
    )
  }
}

const findActiveProductFeatureForProduct = async (
  productId: string,
  featureId: string,
  transaction: DbTransaction
): Promise<ProductFeature.Record> => {
  const [productFeature] = await selectProductFeatures(
    {
      productId,
      featureId,
    },
    transaction
  )
  if (!productFeature) {
    throw new Error(
      `Feature ${featureId} is not attached to product ${productId}.`
    )
  }
  if (productFeature.expiredAt !== null) {
    throw new Error(
      `Feature ${featureId} is expired for product ${productId}.`
    )
  }
  return productFeature
}

const findCurrentBillingPeriodForSubscription = async (
  subscriptionId: string,
  transaction: DbTransaction
) => {
  const billingPeriods = await selectBillingPeriods(
    { subscriptionId },
    transaction
  )
  const now = Date.now()
  return (
    billingPeriods.find(
      (billingPeriod) =>
        billingPeriod.startDate <= now && billingPeriod.endDate >= now
    ) ?? null
  )
}

const grantImmediateUsageCredits = async (
  {
    subscription,
    subscriptionItemFeature,
  }: {
    subscription: Subscription.Record
    subscriptionItemFeature: SubscriptionItemFeature.Record
  },
  transaction: DbTransaction
) => {
  const usageMeterId = subscriptionItemFeature.usageMeterId
  const amount = subscriptionItemFeature.amount
  if (!usageMeterId || amount === null) {
    throw new Error(
      `Subscription item feature ${subscriptionItemFeature.id} is missing usage meter or amount for immediate credit grant.`
    )
  }

  const currentBillingPeriod =
    await findCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )
  if (!amount) {
    return
  }
  const usageCredit = await insertUsageCredit(
    {
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
      creditType: UsageCreditType.Grant,
      sourceReferenceId: subscriptionItemFeature.id,
      sourceReferenceType:
        UsageCreditSourceReferenceType.ManualAdjustment,
      billingPeriodId: currentBillingPeriod?.id ?? null,
      usageMeterId,
      paymentId: null,
      issuedAmount: amount,
      issuedAt: Date.now(),
      expiresAt: currentBillingPeriod?.endDate ?? null,
      status: UsageCreditStatus.Posted,
      notes: null,
      metadata: null,
    },
    transaction
  )

  const ledgerCommand: CreditGrantRecognizedLedgerCommand = {
    type: LedgerTransactionType.CreditGrantRecognized,
    organizationId: subscription.organizationId,
    livemode: subscription.livemode,
    subscriptionId: subscription.id,
    payload: {
      usageCredit,
    },
  }

  return {
    usageCredit,
    ledgerCommand,
  }
}

export const addFeatureToSubscriptionItem = async (
  input: AddFeatureToSubscriptionInput,
  transaction: DbTransaction
): Promise<
  TransactionOutput<{
    subscriptionItemFeature: SubscriptionItemFeature.Record
  }>
> => {
  const {
    subscriptionItemId,
    featureId,
    grantCreditsImmediately = false,
  } = input

  const subscriptionItem = await selectSubscriptionItemById(
    subscriptionItemId,
    transaction
  )
  ensureSubscriptionItemIsActive(subscriptionItem)

  const subscription = await selectSubscriptionById(
    subscriptionItem.subscriptionId,
    transaction
  )

  const feature = await selectFeatureById(featureId, transaction)
  ensureFeatureIsEligible(feature)
  ensureOrganizationAndLivemodeMatch({
    subscription,
    subscriptionItem,
    feature,
  })

  const price = await selectPriceById(
    subscriptionItem.priceId,
    transaction
  )
  const product = await selectProductById(
    price.productId,
    transaction
  )
  ensureFeatureBelongsToProductPricingModel({ product, feature })

  if (
    grantCreditsImmediately &&
    feature.type !== FeatureType.UsageCreditGrant
  ) {
    throw new Error(
      'grantCreditsImmediately is only supported for usage credit features.'
    )
  }

  const productFeature = await findActiveProductFeatureForProduct(
    product.id,
    feature.id,
    transaction
  )

  const featureInsert =
    subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
      subscriptionItem,
      productFeature,
      feature
    )

  let subscriptionItemFeature: SubscriptionItemFeature.Record

  if (feature.type === FeatureType.Toggle) {
    const [upserted] =
      await upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId(
        featureInsert,
        transaction
      )
    if (upserted) {
      subscriptionItemFeature = upserted
    } else {
      const [existingToggle] = await selectSubscriptionItemFeatures(
        {
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          expiredAt: null,
        },
        transaction
      )
      if (!existingToggle) {
        throw new Error(
          `Failed to upsert toggle feature ${feature.id} for subscription item ${subscriptionItem.id}.`
        )
      }
      subscriptionItemFeature = existingToggle
    }
  } else {
    const usageFeatureInsert =
      featureInsert as SubscriptionItemFeature.UsageCreditGrantInsert
    const [existingUsageFeature] =
      await selectSubscriptionItemFeatures(
        {
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          expiredAt: null,
        },
        transaction
      )

    if (existingUsageFeature) {
      if (
        existingUsageFeature.type !== FeatureType.UsageCreditGrant
      ) {
        throw new Error(
          `Existing feature ${existingUsageFeature.id} is not a usage credit grant.`
        )
      }
      subscriptionItemFeature = await updateSubscriptionItemFeature(
        {
          ...existingUsageFeature,
          amount:
            (existingUsageFeature.amount ?? 0) +
            usageFeatureInsert.amount,
          productFeatureId: usageFeatureInsert.productFeatureId,
          usageMeterId: usageFeatureInsert.usageMeterId,
          renewalFrequency: usageFeatureInsert.renewalFrequency,
          expiredAt: null,
        },
        transaction
      )
    } else {
      subscriptionItemFeature = await insertSubscriptionItemFeature(
        usageFeatureInsert,
        transaction
      )
    }
  }

  let ledgerCommand: CreditGrantRecognizedLedgerCommand | undefined

  if (
    feature.type === FeatureType.UsageCreditGrant &&
    grantCreditsImmediately
  ) {
    const immediateGrant = await grantImmediateUsageCredits(
      {
        subscription,
        subscriptionItemFeature,
      },
      transaction
    )
    ledgerCommand = immediateGrant?.ledgerCommand
  }

  return {
    result: { subscriptionItemFeature },
    ledgerCommand,
  }
}
