import {
  FeatureType,
  LedgerTransactionType,
  SubscriptionItemType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@db-core/enums'
import { Customer } from '@db-core/schema/customers'
import type { Feature } from '@db-core/schema/features'
import { Price } from '@db-core/schema/prices'
import type { ProductFeature } from '@db-core/schema/productFeatures'
import type {
  AddFeatureToSubscriptionInput,
  SubscriptionItemFeature,
} from '@db-core/schema/subscriptionItemFeatures'
import { subscriptionItemFeatures } from '@db-core/schema/subscriptionItemFeatures'
import {
  type SubscriptionItem,
  subscriptionItems,
} from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import { usageCredits } from '@db-core/schema/usageCredits'
import { Result } from 'better-result'
import { and, eq, isNull } from 'drizzle-orm'
import * as R from 'ramda'
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
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { NotFoundError } from '@/errors'
import { CacheDependency } from '@/utils/cache'

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

  /**
   * Dedupe Resource features within a single product.
   *
   * A product can (accidentally or over time) have multiple active Resource features
   * for the same `resourceId`. Those should not stack (it would double-count capacity).
   * Instead, treat them as overrides and pick the most recently created one per resource.
   */
  const dedupeResourceFeaturesForProduct = (
    dataForProduct: Array<{
      feature: Feature.Record
      productFeature: ProductFeature.Record
    }>
  ) => {
    const nonResource = dataForProduct.filter(
      (d) => d.feature.type !== FeatureType.Resource
    )

    const resource = dataForProduct.filter(
      (
        d
      ): d is {
        feature: Feature.ResourceRecord
        productFeature: ProductFeature.Record
      } => d.feature.type === FeatureType.Resource
    )

    const latestByResourceId = new Map<
      string,
      {
        feature: Feature.ResourceRecord
        productFeature: ProductFeature.Record
      }
    >()

    for (const entry of resource) {
      const resourceId = entry.feature.resourceId
      if (!resourceId) {
        continue
      }
      const existing = latestByResourceId.get(resourceId)
      if (!existing) {
        latestByResourceId.set(resourceId, entry)
        continue
      }
      // Use createdAt as primary sort key, with position as tiebreaker
      // (position is a bigserial that preserves insertion order even within a transaction,
      // unlike timestamps which are fixed at transaction start in PostgreSQL)
      if (
        entry.feature.createdAt > existing.feature.createdAt ||
        (entry.feature.createdAt === existing.feature.createdAt &&
          (entry.feature.position ?? 0) >
            (existing.feature.position ?? 0))
      ) {
        latestByResourceId.set(resourceId, entry)
      }
    }

    return [
      ...nonResource,
      ...Array.from(latestByResourceId.values()),
    ]
  }

  pricesToFetchFeaturesFor.forEach((price) => {
    result.set(price.id, [])
  })

  // Filter to only product prices (subscription and single_payment).
  // Usage prices don't have productId, so they can't have features.
  const productPrices = pricesToFetchFeaturesFor.filter(
    Price.hasProductId
  )

  const uniqueProductIds: string[] = R.uniq(
    productPrices.map((p) => p.productId)
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

  for (const price of productPrices) {
    const dataForProduct = productIdToDataMap.get(price.productId)
    if (dataForProduct) {
      result.set(
        price.id,
        dedupeResourceFeaturesForProduct(dataForProduct)
      )
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
      case FeatureType.Resource: {
        const resourceAmount = manuallyCreated
          ? feature.amount
          : feature.amount * subscriptionItem.quantity
        return {
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          type: FeatureType.Resource,
          livemode: subscriptionItem.livemode,
          usageMeterId: null,
          amount: resourceAmount,
          renewalFrequency: null,
          productFeatureId: productFeature?.id ?? null,
          expiredAt: null,
          detachedAt: null,
          detachedReason: null,
          manuallyCreated: manuallyCreated ?? false,
          resourceId: feature.resourceId,
        }
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
): Promise<
  Result<SubscriptionItemFeature.Record[], NotFoundError>
> => {
  if (R.isEmpty(subscriptionItems)) {
    return Result.ok([])
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
    return Result.ok([])
  }

  const pricesWhereClause: Price.Where = {
    id: uniquePriceIds,
  }
  const pricesFetched = await selectPrices(
    pricesWhereClause,
    transaction
  )

  if (R.isEmpty(pricesFetched)) {
    return Result.ok([])
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
  return Result.ok([])
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
  ctx: TransactionEffectsContext
): Promise<void> => {
  const { transaction, enqueueLedgerCommand } = ctx
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

  // Check for existing credits for this feature in this billing period (or without billing period)
  // Use stable featureId (not ephemeral subscription_item_feature.id) for deduplication
  const stableFeatureId = subscriptionItemFeature.featureId
  if (stableFeatureId) {
    // Build the WHERE conditions
    const whereConditions = [
      eq(usageCredits.subscriptionId, subscription.id),
      eq(
        usageCredits.sourceReferenceType,
        UsageCreditSourceReferenceType.ManualAdjustment
      ),
      eq(subscriptionItemFeatures.featureId, stableFeatureId),
      eq(usageCredits.usageMeterId, usageMeterId),
    ]

    // If we have a billing period, scope deduplication to that period
    // If not, check for credits with null billingPeriodId
    if (currentBillingPeriod) {
      whereConditions.push(
        eq(usageCredits.billingPeriodId, currentBillingPeriod.id)
      )
    } else {
      whereConditions.push(isNull(usageCredits.billingPeriodId))
    }

    const existingCredits = await transaction
      .select({ id: usageCredits.id })
      .from(usageCredits)
      .innerJoin(
        subscriptionItemFeatures,
        eq(
          usageCredits.sourceReferenceId,
          subscriptionItemFeatures.id
        )
      )
      .where(and(...whereConditions))
      .limit(1)

    if (existingCredits.length > 0) {
      // Credits already exist for this feature in this billing period - skip
      return
    }
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
      issuedAmount: grantAmount,
      issuedAt: Date.now(),
      expiresAt: currentBillingPeriod?.endDate ?? null,
      status: UsageCreditStatus.Posted,
      notes: null,
      metadata: null,
    },
    transaction
  )

  enqueueLedgerCommand({
    type: LedgerTransactionType.CreditGrantRecognized,
    organizationId: subscription.organizationId,
    livemode: subscription.livemode,
    subscriptionId: subscription.id,
    payload: {
      usageCredit,
    },
  })
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
  ctx: TransactionEffectsContext
): Promise<
  Result<
    {
      subscriptionItemFeature: SubscriptionItemFeature.Record
    },
    Error
  >
> => {
  try {
    const { transaction } = ctx
    const {
      subscriptionItemId,
      featureId,
      grantCreditsImmediately = false,
    } = input

    const providedSubscriptionItem = (
      await selectSubscriptionItemById(
        subscriptionItemId,
        transaction
      )
    ).unwrap()
    ensureSubscriptionItemIsActive(providedSubscriptionItem)

    const subscription = (
      await selectSubscriptionById(
        providedSubscriptionItem.subscriptionId,
        transaction
      )
    ).unwrap()

    const feature = (
      await selectFeatureById(featureId, transaction)
    ).unwrap()
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

    const customer = (
      await selectCustomerById(subscription.customerId, transaction)
    ).unwrap()
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
      const upsertResult =
        await upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId(
          featureInsert,
          transaction
        )
      if (Result.isError(upsertResult)) {
        return Result.err(upsertResult.error)
      }
      const [upserted] = upsertResult.value
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
    if (
      feature.type === FeatureType.UsageCreditGrant &&
      grantCreditsImmediately
    ) {
      if (!usageFeatureInsert) {
        throw new Error(
          'Missing usage feature insert data for immediate credit grant.'
        )
      }
      await grantImmediateUsageCredits(
        {
          subscription,
          subscriptionItemFeature,
          grantAmount: usageFeatureInsert.amount,
        },
        ctx
      )
    }

    ctx.invalidateCache(
      CacheDependency.subscriptionItemFeatures(
        manualSubscriptionItem.id
      )
    )

    return Result.ok({ subscriptionItemFeature })
  } catch (error) {
    return Result.err(
      error instanceof Error ? error : new Error(String(error))
    )
  }
}
