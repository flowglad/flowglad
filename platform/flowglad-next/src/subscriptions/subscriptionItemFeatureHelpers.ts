import { and, eq, isNull } from 'drizzle-orm'
import * as R from 'ramda'
import type { CreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { Price } from '@/db/schema/prices'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type {
  AddFeatureToSubscriptionInput,
  SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import { subscriptionItemFeatures } from '@/db/schema/subscriptionItemFeatures'
import {
  type SubscriptionItem,
  subscriptionItems,
} from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  usageCredits,
  usageCreditsSelectSchema,
} from '@/db/schema/usageCredits'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import {
  bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId,
  insertSubscriptionItemFeature,
  selectSubscriptionItemFeatures,
  updateSubscriptionItemFeature,
  upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  selectSubscriptionItemById,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  derivePricingModelIdFromSubscription,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import {
  insertUsageCredit,
  insertUsageCreditOrDoNothing,
} from '@/db/tableMethods/usageCreditMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import {
  FeatureType,
  LedgerTransactionType,
  SubscriptionItemType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'

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
  (args: {
    subscriptionItem: SubscriptionItem.Record
    feature: Feature.Record
    productFeature?: ProductFeature.Record
    manuallyCreated?: boolean
  }): SubscriptionItemFeature.Insert => {
    const {
      subscriptionItem,
      feature,
      productFeature,
      manuallyCreated,
    } = args
    switch (feature.type) {
      case FeatureType.UsageCreditGrant:
        // Manually Created Subscription Items have a quantity of 0
        const amount = manuallyCreated
          ? feature.amount
          : feature.amount * subscriptionItem.quantity

        return {
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          type: FeatureType.UsageCreditGrant,
          livemode: subscriptionItem.livemode,
          usageMeterId: feature.usageMeterId,
          amount: amount,
          renewalFrequency: feature.renewalFrequency,
          productFeatureId: productFeature?.id ?? null,
          expiredAt: null,
          detachedAt: null,
          detachedReason: null,
          manuallyCreated: manuallyCreated ?? false,
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
          manuallyCreated: manuallyCreated ?? false,
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

  const hasPriceId = (
    item: SubscriptionItem.Record
  ): item is SubscriptionItem.Record & { priceId: string } => {
    return item.priceId !== null
  }

  // Filter out items without priceId
  const subscriptionItemsWithPriceId =
    subscriptionItems.filter(hasPriceId)

  const uniquePriceIds: string[] = R.uniq(
    subscriptionItemsWithPriceId.map((item) => item.priceId)
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
    subscriptionItemsWithPriceId.flatMap((item) => {
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
          {
            subscriptionItem: item,
            feature,
            productFeature,
          }
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

const ensureFeatureBelongsToCustomerPricingModel = async ({
  customer,
  feature,
  transaction,
}: {
  customer: Customer.Record
  feature: Feature.Record
  transaction: DbTransaction
}) => {
  let customerPricingModelId: string | null = customer.pricingModelId

  // If customer doesn't have explicit pricing model, get the default one
  if (!customerPricingModelId) {
    const defaultPricingModels = await selectPricingModels(
      {
        isDefault: true,
        organizationId: customer.organizationId,
        livemode: customer.livemode,
      },
      transaction
    )

    if (defaultPricingModels.length === 0) {
      throw new Error(
        `No default pricing model found for organization ${customer.organizationId}`
      )
    }

    if (defaultPricingModels.length > 1) {
      throw new Error(
        `Multiple default pricing models found for organization ${customer.organizationId}`
      )
    }

    customerPricingModelId = defaultPricingModels[0].id
  }

  if (customerPricingModelId !== feature.pricingModelId) {
    throw new Error(
      `Feature ${feature.id} does not belong to the same pricing model as customer ${customer.id}.`
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

  /*
   * We rely on the database unique index on (sourceReferenceId, sourceReferenceType, billingPeriodId)
   * to prevent duplicate grants. The helper `insertUsageCreditOrDoNothing` handles the conflict gracefully.
   */
  let usageCredit = await insertUsageCreditOrDoNothing(
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

  if (!usageCredit) {
    // If undefined, it means the credit already existed (conflict).
    // fetch the existing one to return it, ensuring idempotency.
    const [existing] = await transaction
      .select()
      .from(usageCredits)
      .where(
        and(
          eq(
            usageCredits.sourceReferenceId,
            subscriptionItemFeature.id
          ),
          eq(
            usageCredits.sourceReferenceType,
            UsageCreditSourceReferenceType.ManualAdjustment
          ),
          currentBillingPeriod
            ? eq(
                usageCredits.billingPeriodId,
                currentBillingPeriod.id
              )
            : isNull(usageCredits.billingPeriodId)
        )
      )
      .limit(1)

    // Parse the existing record to ensure it matches UsageCredit.Record strict types if necessary,
    // though distinct from insert return it should be fine as both are from the same table.
    // However, to be safe and satisfy TS flow:
    if (!existing) {
      // Should technically not happen if onConflictDoNothing returned undefined due to conflict
      return undefined
    }
    usageCredit = usageCreditsSelectSchema.parse(existing)
  }

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

const findOrCreateManualSubscriptionItem = async (
  subscriptionId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<SubscriptionItem.Record> => {
  const pricingModelId = await derivePricingModelIdFromSubscription(
    subscriptionId,
    transaction
  )

  const manualItemInsert: SubscriptionItem.Insert & {
    pricingModelId: string
  } = {
    subscriptionId,
    name: 'Manual Features',
    priceId: null,
    unitPrice: 0,
    quantity: 0,
    addedDate: Date.now(),
    expiredAt: null,
    metadata: null,
    externalId: null,
    type: SubscriptionItemType.Static,
    manuallyCreated: true,
    livemode,
    pricingModelId,
  }

  // Try to insert, do nothing if conflict occurs due to unique constraint
  await transaction
    .insert(subscriptionItems)
    .values(manualItemInsert)
    .onConflictDoNothing()

  // Now select the manual item (either the one we just inserted or the existing one)
  const existingManualItems = await selectSubscriptionItems(
    {
      subscriptionId,
      manuallyCreated: true,
      expiredAt: null,
    },
    transaction
  )

  if (existingManualItems.length === 0) {
    throw new Error(
      `Failed to find or create manual subscription item for subscription ${subscriptionId}`
    )
  }

  return existingManualItems[0]
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

  const providedSubscriptionItem = await selectSubscriptionItemById(
    subscriptionItemId,
    transaction
  )
  ensureSubscriptionItemIsActive(providedSubscriptionItem)

  const subscription = await selectSubscriptionById(
    providedSubscriptionItem.subscriptionId,
    transaction
  )

  const feature = await selectFeatureById(featureId, transaction)
  ensureFeatureIsEligible(feature)
  ensureOrganizationAndLivemodeMatch({
    subscription,
    subscriptionItem: providedSubscriptionItem,
    feature,
  })

  // Find or create manual subscription item for this sub
  const manualSubscriptionItem =
    await findOrCreateManualSubscriptionItem(
      subscription.id,
      subscription.livemode,
      transaction
    )

  const customer = await selectCustomerById(
    subscription.customerId,
    transaction
  )
  await ensureFeatureBelongsToCustomerPricingModel({
    customer,
    feature,
    transaction,
  })

  if (
    grantCreditsImmediately &&
    feature.type !== FeatureType.UsageCreditGrant
  ) {
    throw new Error(
      'grantCreditsImmediately is only supported for usage credit features.'
    )
  }

  const featureInsert =
    subscriptionItemFeatureInsertFromSubscriptionItemAndFeature({
      subscriptionItem: manualSubscriptionItem,
      feature,
      productFeature: undefined,
      manuallyCreated: true, // manuallyCreated - this is a manual addition via API
    })

  let usageFeatureInsert: SubscriptionItemFeature.UsageCreditGrantInsert | null =
    null

  let subscriptionItemFeature: SubscriptionItemFeature.Record

  /**
   * Adds or updates a SubscriptionItemFeature for the given subscription item and feature.
   *
   * Handles deduplication by checking if an appropriate SubscriptionItemFeature already exists for
   * the given subscription item and feature. If a matching record is found (not expired), it will be
   * updated instead of inserting a new row, ensuring feature assignment is idempotent and no duplicates
   * are created.
   *
   * - For Toggle features, attempts an upsert by productFeatureId + subscriptionId. If an upserted record
   *   is returned, it is used. Otherwise, falls back to selecting an existing Toggle feature. This ensures
   *   toggles are not duplicated even under high concurrency (race conditions).
   *
   * - For UsageCreditGrant features, if one already exists and is not expired, the amount is incremented
   *   and related fields updated. If none exists, a new feature is inserted.
   *
   * Throws descriptive errors if data integrity cannot be ensured.
   */
  if (feature.type === FeatureType.Toggle) {
    // Upsert (insert-or-update) the toggle feature for this subscription item/product/feature.
    // If upsert returns, use the returned record. Otherwise, fall back to fetching the existing record.
    const [upserted] =
      await upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId(
        featureInsert,
        transaction
      )
    if (upserted) {
      subscriptionItemFeature = upserted
    } else {
      // The upsert didn't return a record; retrieve the (now existing) toggle feature.
      const [existingToggle] = await selectSubscriptionItemFeatures(
        {
          subscriptionItemId: manualSubscriptionItem.id,
          featureId: feature.id,
          expiredAt: null,
        },
        transaction
      )
      if (!existingToggle) {
        throw new Error(
          `Failed to upsert toggle feature ${feature.id} for subscription item ${manualSubscriptionItem.id}.`
        )
      }
      subscriptionItemFeature = existingToggle
    }
  } else {
    // Handle usage-credit-grant features
    const usageFeatureInsertData =
      featureInsert as SubscriptionItemFeature.UsageCreditGrantInsert
    usageFeatureInsert = usageFeatureInsertData
    // Check for an existing (not expired) usage feature for these entities
    const [existingUsageFeature] =
      await selectSubscriptionItemFeatures(
        {
          subscriptionItemId: manualSubscriptionItem.id,
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
