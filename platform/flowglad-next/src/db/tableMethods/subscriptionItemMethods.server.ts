/**
 * Server-only subscription item methods.
 *
 * This file contains functions that:
 * 1. Use cachedRecomputable (server-only caching with auto-recomputation)
 * 2. Import from subscriptionItemFeatureMethods (which would create circular deps if in main file)
 *
 * IMPORTANT: Only import this file from server-side code. Importing from client code
 * will cause build failures due to postgres/node.js dependencies.
 */

import type { SubscriptionStatus } from '@db-core/enums'
import {
  type Price,
  prices,
  pricesClientSelectSchema,
} from '@db-core/schema/prices'
import {
  type SubscriptionItem,
  subscriptionItems,
  subscriptionItemsSelectSchema,
} from '@db-core/schema/subscriptionItems'
import {
  type Subscription,
  subscriptions,
} from '@db-core/schema/subscriptions'
import { type SelectConditions } from '@db-core/tableUtils'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { DbTransaction } from '@/db/types'
import {
  type RichSubscription,
  richSubscriptionClientSelectSchema,
} from '@/subscriptions/schemas'
import {
  CacheDependency,
  type CacheRecomputationContext,
  cachedBulkLookup,
} from '@/utils/cache'
import { cachedRecomputable } from '@/utils/cache-recomputable'
import core from '@/utils/core'
import { RedisKeyNamespace } from '@/utils/redis'
import { selectUsageMeterBalancesForSubscriptions } from './ledgerEntryMethods'
import {
  expireSubscriptionItemFeaturesForSubscriptionItems,
  selectSubscriptionItemFeaturesWithFeatureSlugs,
} from './subscriptionItemFeatureMethods'
import {
  isSubscriptionCurrent,
  selectSubscriptions,
  selectSubscriptionsByCustomerId,
} from './subscriptionMethods'

/**
 * Internal function to select subscription items with their associated prices.
 * This is the raw database query without caching.
 */
const selectSubscriptionItemsWithPricesInternal = async (
  subscriptionIds: string[],
  transaction: DbTransaction
) => {
  if (subscriptionIds.length === 0) {
    return []
  }

  const rows = await transaction
    .select({
      subscriptionItem: subscriptionItems,
      price: prices,
    })
    .from(subscriptionItems)
    .leftJoin(prices, eq(subscriptionItems.priceId, prices.id))
    .where(inArray(subscriptionItems.subscriptionId, subscriptionIds))

  return rows.map((row) => ({
    subscriptionItem: subscriptionItemsSelectSchema.parse(
      row.subscriptionItem
    ),
    price: row.price
      ? pricesClientSelectSchema.parse(row.price)
      : null,
  }))
}

/** Schema for validating cached subscription items with prices */
const subscriptionItemWithPriceSchema = z.object({
  subscriptionItem: subscriptionItemsSelectSchema,
  price: pricesClientSelectSchema.nullable(),
})

/**
 * Params schema for selectSubscriptionItemsWithPricesBySubscriptionIdCachedInternal.
 * Used by cachedRecomputable() for validation during recomputation.
 */
const selectSubscriptionItemsParamsSchema = z.object({
  subscriptionId: z.string(),
  livemode: z.boolean(),
})

/**
 * Params type for selectSubscriptionItemsWithPricesBySubscriptionIdCachedInternal.
 */
type SelectSubscriptionItemsParams = z.infer<
  typeof selectSubscriptionItemsParamsSchema
>

/**
 * Internal cached implementation for single subscription lookup with automatic recomputation.
 * Cache key includes livemode to prevent mixing live/test data.
 */
const selectSubscriptionItemsWithPricesBySubscriptionIdCachedInternal =
  cachedRecomputable<
    SelectSubscriptionItemsParams,
    {
      subscriptionItem: SubscriptionItem.Record
      price: Price.ClientRecord | null
    }[]
  >(
    {
      namespace: RedisKeyNamespace.ItemsBySubscription,
      paramsSchema: selectSubscriptionItemsParamsSchema,
      keyFn: (params) =>
        `${params.subscriptionId}:${params.livemode}`,
      schema: subscriptionItemWithPriceSchema.array(),
      dependenciesFn: (params, items) => [
        CacheDependency.subscriptionItems(params.subscriptionId),
        ...items.map((item) =>
          CacheDependency.subscriptionItem(item.subscriptionItem.id)
        ),
      ],
    },
    async (params, transaction, _cacheRecomputationContext) => {
      return selectSubscriptionItemsWithPricesInternal(
        [params.subscriptionId],
        transaction
      )
    }
  )

/**
 * Selects subscription items with their associated prices for a single subscription.
 * Results are cached by default using Redis with dependency-based invalidation.
 */
export const selectSubscriptionItemsWithPricesBySubscriptionId =
  async (
    subscriptionId: string,
    transaction: DbTransaction,
    cacheRecomputationContext: CacheRecomputationContext,
    options: { ignoreCache?: boolean } = {}
  ) => {
    if (options.ignoreCache) {
      return selectSubscriptionItemsWithPricesInternal(
        [subscriptionId],
        transaction
      )
    }
    return selectSubscriptionItemsWithPricesBySubscriptionIdCachedInternal(
      {
        subscriptionId,
        livemode: cacheRecomputationContext.livemode,
      },
      transaction,
      cacheRecomputationContext
    )
  }

/** Type alias for subscription item with price result */
type SubscriptionItemWithPrice = {
  subscriptionItem: SubscriptionItem.Record
  price: Price.ClientRecord | null
}

/**
 * Selects subscription items with their associated prices for multiple subscriptions.
 * Results are cached by default using Redis with dependency-based invalidation.
 */
export const selectSubscriptionItemsWithPricesBySubscriptionIds =
  async (
    subscriptionIds: string[],
    transaction: DbTransaction,
    livemode: boolean,
    options: { ignoreCache?: boolean } = {}
  ): Promise<SubscriptionItemWithPrice[]> => {
    if (subscriptionIds.length === 0) {
      return []
    }

    if (options.ignoreCache) {
      return selectSubscriptionItemsWithPricesInternal(
        subscriptionIds,
        transaction
      )
    }

    const resultsMap = await cachedBulkLookup<
      string,
      SubscriptionItemWithPrice
    >(
      {
        namespace: RedisKeyNamespace.ItemsBySubscription,
        keyFn: (subscriptionId: string) =>
          `${subscriptionId}:${livemode}`,
        schema: subscriptionItemWithPriceSchema.array(),
        dependenciesFn: (items, subscriptionId: string) => [
          CacheDependency.subscriptionItems(subscriptionId),
          ...items.map((item) =>
            CacheDependency.subscriptionItem(item.subscriptionItem.id)
          ),
        ],
      },
      subscriptionIds,
      async (missedSubscriptionIds: string[]) => {
        return selectSubscriptionItemsWithPricesInternal(
          missedSubscriptionIds,
          transaction
        )
      },
      (item: SubscriptionItemWithPrice) =>
        item.subscriptionItem.subscriptionId
    )

    return Array.from(resultsMap.values()).flat()
  }

/**
 * Determines if a subscription item is currently active based on its expiry date.
 */
const isSubscriptionItemActive = (item: {
  expiredAt?: number | null
}): boolean => {
  return !item.expiredAt || item.expiredAt > Date.now()
}

/**
 * Processes subscription and item data to build the rich subscriptions map.
 */
const buildRichSubscriptionsMap = (
  subscriptionRecords: Subscription.Record[],
  itemsWithPrices: {
    subscriptionItem: SubscriptionItem.Record
    price: Price.ClientRecord | null
  }[]
): Map<string, RichSubscription> => {
  const richSubscriptionsMap = new Map<string, RichSubscription>()

  for (const subscription of subscriptionRecords) {
    richSubscriptionsMap.set(subscription.id, {
      ...subscription,
      current: isSubscriptionCurrent(
        subscription.status as SubscriptionStatus,
        subscription.cancellationReason
      ),
      subscriptionItems: [],
    })
  }

  for (const { subscriptionItem, price } of itemsWithPrices) {
    if (!isSubscriptionItemActive(subscriptionItem)) {
      continue
    }
    if (!price) {
      continue
    }
    const subscription = richSubscriptionsMap.get(
      subscriptionItem.subscriptionId
    )
    if (subscription) {
      subscription.subscriptionItems.push({
        ...subscriptionItem,
        price,
      })
    }
  }

  return richSubscriptionsMap
}

/**
 * Fetches subscriptions with their active items, features, and usage meter balances.
 * This function performs decomposed queries that can be cached independently.
 */
export const selectRichSubscriptionsAndActiveItems = async (
  whereConditions: SelectConditions<typeof subscriptions>,
  transaction: DbTransaction,
  cacheRecomputationContext: CacheRecomputationContext
): Promise<RichSubscription[]> => {
  const { livemode } = cacheRecomputationContext
  let subscriptionRecords: Subscription.Record[]
  const customerId = whereConditions.customerId
  const isSimpleCustomerIdQuery =
    typeof customerId === 'string' &&
    Object.keys(whereConditions).length === 1

  if (isSimpleCustomerIdQuery) {
    subscriptionRecords = await selectSubscriptionsByCustomerId(
      customerId,
      livemode,
      transaction
    )
  } else {
    subscriptionRecords = await selectSubscriptions(
      whereConditions,
      transaction
    )
  }

  const subscriptionIds = subscriptionRecords.map((s) => s.id)

  if (subscriptionIds.length === 0) {
    return []
  }

  const itemsWithPrices =
    await selectSubscriptionItemsWithPricesBySubscriptionIds(
      subscriptionIds,
      transaction,
      livemode
    )

  const richSubscriptionsMap = buildRichSubscriptionsMap(
    subscriptionRecords,
    itemsWithPrices
  )

  const activeSubscriptionItems = itemsWithPrices
    .filter(({ subscriptionItem }) =>
      isSubscriptionItemActive(subscriptionItem)
    )
    .map(({ subscriptionItem }) => subscriptionItem)

  const activeSubscriptionItemIds = activeSubscriptionItems.map(
    (item) => item.id
  )
  const allSubscriptionItemFeaturesPromise =
    selectSubscriptionItemFeaturesWithFeatureSlugs(
      activeSubscriptionItemIds,
      transaction,
      livemode
    )

  const [allSubscriptionItemFeatures, usageMeterBalances] =
    await Promise.all([
      allSubscriptionItemFeaturesPromise,
      selectUsageMeterBalancesForSubscriptions(
        { subscriptionId: subscriptionIds },
        transaction
      ),
    ])

  const subscriptionItemFeatures = allSubscriptionItemFeatures.filter(
    (f) => !f.expiredAt || f.expiredAt > Date.now()
  )

  const subscriptionItemsById = core.groupBy(
    (item) => item.id,
    activeSubscriptionItems
  )
  const featuresBySubscriptionId = core.groupBy((feature) => {
    const subscriptionItem =
      subscriptionItemsById[feature.subscriptionItemId]?.[0]
    if (!subscriptionItem)
      throw new Error('Subscription item not found')
    return subscriptionItem.subscriptionId
  }, subscriptionItemFeatures)
  const meterBalancesBySubscriptionId = core.groupBy(
    (item) => item.subscriptionId,
    usageMeterBalances
  )

  const richSubscriptions = Array.from(
    richSubscriptionsMap.values()
  ).map((subscription) => ({
    ...subscription,
    experimental: {
      usageMeterBalances:
        meterBalancesBySubscriptionId[subscription.id]?.map(
          (item) => item.usageMeterBalance
        ) ?? [],
      featureItems: featuresBySubscriptionId[subscription.id] ?? [],
    },
  }))

  return richSubscriptions.map((item) =>
    richSubscriptionClientSelectSchema.parse(item)
  )
}

/**
 * Expires subscription items and their associated features.
 */
export const expireSubscriptionItems = async (
  subscriptionItemIds: string[],
  expiredAt: Date | number,
  transaction: DbTransaction
) => {
  const result = await transaction
    .update(subscriptionItems)
    .set({
      expiredAt: new Date(expiredAt).getTime(),
    })
    .where(inArray(subscriptionItems.id, subscriptionItemIds))
  await expireSubscriptionItemFeaturesForSubscriptionItems(
    subscriptionItemIds,
    new Date(expiredAt).getTime(),
    transaction
  )
  return subscriptionItemsSelectSchema.array().parse(result)
}
