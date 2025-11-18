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

/**
 * Creates a subscription item feature insert object from a subscription item and feature.
 *
 * This function constructs the appropriate insert schema based on the feature type:
 * - For UsageCreditGrant features: includes usage meter, amount (multiplied by subscription item quantity),
 *   and renewal frequency
 * - For Toggle features: sets usage-related fields to null
 *
 * The productFeature parameter is optional to support features that may not have a direct
 * product feature association (e.g., manually added features).
 *
 * @param subscriptionItem - The subscription item to attach the feature to
 * @param feature - The feature to attach (must match the subscription item's pricing model)
 * @param productFeature - Optional product feature association (null if not provided)
 * @returns A SubscriptionItemFeature.Insert object ready for database insertion
 * @throws Error if the feature type is unknown
 */
export const subscriptionItemFeatureInsertFromSubscriptionItemAndFeature =
  (
    subscriptionItem: SubscriptionItem.Record,
    feature: Feature.Record,
    productFeature?: ProductFeature.Record
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
          productFeatureId: productFeature?.id ?? null,
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
          productFeatureId: productFeature?.id ?? null,
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
 *
 * This function:
 * 1. Fetches all unique prices from the provided subscription items
 * 2. Retrieves product features associated with each price
 * 3. Creates corresponding subscription item feature records for each item/feature pair
 *
 * Note: This can potentially create duplicate feature grants if subscriptions include
 * multiple prices from the same product. Consider deduplication if needed.
 *
 * @param subscriptionItems - An array of subscription items to create features for
 * @param transaction - The database transaction to use for all operations
 * @returns A Promise resolving to an array of created SubscriptionItemFeature records
 * @returns Empty array if no subscription items provided or no features found
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
          feature,
          productFeature
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

/**
 * Grants immediate usage credits for a subscription item feature.
 *
 * Creates a usage credit record and processes a CreditGrantRecognized ledger command
 * to immediately grant credits to a customer's usage meter. This is used when
 * `grantCreditsImmediately` is true when adding a usage credit grant feature.
 *
 * The credit is associated with the current billing period and will expire at the
 * end of that period (if a billing period exists).
 *
 * @param params - Object containing:
 *   - subscription: The subscription record
 *   - subscriptionItemFeature: The subscription item feature that triggered the grant
 *   - grantAmount: The amount of credits to grant
 * @param transaction - The database transaction to use for all operations
 * @returns An object containing the created usage credit and ledger command, or undefined if grantAmount is 0
 * @throws Error if the subscription item feature is missing a usage meter ID
 */
const grantImmediateUsageCredits = async (
  {
    subscription,
    subscriptionItemFeature,
    grantAmount,
  }: {
    subscription: Subscription.Record
    subscriptionItemFeature: SubscriptionItemFeature.Record
    grantAmount: number
  },
  transaction: DbTransaction
) => {
  const usageMeterId = subscriptionItemFeature.usageMeterId
  if (!usageMeterId) {
    throw new Error(
      `Subscription item feature ${subscriptionItemFeature.id} is missing usage meter for immediate credit grant.`
    )
  }
  if (!grantAmount) {
    return
  }

  const currentBillingPeriod =
    await findCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )
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
      issuedAmount: grantAmount,
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

/**
 * Adds a feature to a subscription item.
 *
 * Validates subscription item, feature eligibility, organization/livemode matching, and pricing model compatibility.
 * For toggle features, rejects if already added. For usage credit grants, increments amount if exists, otherwise inserts.
 *
 * When `grantCreditsImmediately` is true for usage features, creates an immediate usage credit grant and
 * processes a CreditGrantRecognized ledger command. Credits expire at the end of the current billing period.
 *
 * @param input - Contains subscriptionItemId, featureId, and optional grantCreditsImmediately flag
 * @param transaction - The database transaction to use for all operations
 * @returns TransactionOutput with the subscription item feature record and optional ledger command
 * @throws Error if validation fails or attempting to add a duplicate toggle feature
 */
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

  // Validate that toggle features are not already added to this subscription item
  // This provides explicit validation in addition to the frontend filtering
  if (feature.type === FeatureType.Toggle) {
    const [existingToggle] = await selectSubscriptionItemFeatures(
      {
        subscriptionItemId: subscriptionItem.id,
        featureId: feature.id,
        expiredAt: null,
      },
      transaction
    )
    if (existingToggle) {
      throw new Error(
        `Toggle feature "${feature.name || feature.id}" is already added to this subscription item. Toggle features can only be added once per subscription item.`
      )
    }
  }

  const featureInsert =
    subscriptionItemFeatureInsertFromSubscriptionItemAndFeature(
      subscriptionItem,
      feature
    )

  let usageFeatureInsert: SubscriptionItemFeature.UsageCreditGrantInsert | null =
    null

  let subscriptionItemFeature: SubscriptionItemFeature.Record

  if (feature.type === FeatureType.Toggle) {
    // Insert the toggle feature (validation already ensured it doesn't exist)
    subscriptionItemFeature = await insertSubscriptionItemFeature(
      featureInsert,
      transaction
    )
  } else {
    // Handle usage-credit-grant features
    const usageFeatureInsertData =
      featureInsert as SubscriptionItemFeature.UsageCreditGrantInsert
    usageFeatureInsert = usageFeatureInsertData
    // Check for an existing (not expired) usage feature for these entities
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
      // If found, ensure it's the correct type and update/accumulate
      if (
        existingUsageFeature.type !== FeatureType.UsageCreditGrant
      ) {
        throw new Error(
          `Existing feature ${existingUsageFeature.id} is not a usage credit grant.`
        )
      }
      // Bump the credit amount and update other properties if necessary
      subscriptionItemFeature = await updateSubscriptionItemFeature(
        {
          ...existingUsageFeature,
          amount:
            (existingUsageFeature.amount ?? 0) +
            usageFeatureInsertData.amount,
          productFeatureId: usageFeatureInsertData.productFeatureId,
          usageMeterId: usageFeatureInsertData.usageMeterId,
          renewalFrequency: usageFeatureInsertData.renewalFrequency,
          expiredAt: null,
        },
        transaction
      )
    } else {
      // No previous record, insert a new usage-credit-grant feature
      subscriptionItemFeature = await insertSubscriptionItemFeature(
        usageFeatureInsertData,
        transaction
      )
    }
  }
  let ledgerCommand: CreditGrantRecognizedLedgerCommand | undefined

  if (
    feature.type === FeatureType.UsageCreditGrant &&
    grantCreditsImmediately
  ) {
    if (!usageFeatureInsert) {
      throw new Error(
        'Missing usage feature insert data for immediate credit grant.'
      )
    }
    const immediateGrant = await grantImmediateUsageCredits(
      {
        subscription,
        subscriptionItemFeature,
        grantAmount: usageFeatureInsert.amount,
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
