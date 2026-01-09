import {
  and,
  count,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import {
  nonRenewingStatusSchema,
  type Subscription,
  standardSubscriptionSelectSchema,
  subscriptions,
  subscriptionsInsertSchema,
  subscriptionsSelectSchema,
  subscriptionsTableRowDataSchema,
  subscriptionsUpdateSchema,
} from '@/db/schema/subscriptions'
import {
  createCursorPaginatedSelectFunction,
  createDateNotPassedFilter,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { CancellationReason, SubscriptionStatus } from '@/types'
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import {
  customerClientSelectSchema,
  customers,
} from '../schema/customers'
import type { PaymentMethod } from '../schema/paymentMethods'
import { prices, pricesClientSelectSchema } from '../schema/prices'
import {
  products,
  productsClientSelectSchema,
} from '../schema/products'
import {
  derivePricingModelIdFromPrice,
  pricingModelIdsForPrices,
} from './priceMethods'

const config: ORMMethodCreatorConfig<
  typeof subscriptions,
  typeof subscriptionsSelectSchema,
  typeof subscriptionsInsertSchema,
  typeof subscriptionsUpdateSchema
> = {
  selectSchema: subscriptionsSelectSchema,
  insertSchema: subscriptionsInsertSchema,
  updateSchema: subscriptionsUpdateSchema,
  tableName: 'subscriptions',
}

/**
 * Extended filter type for subscriptions table that includes cross-table filters.
 * The `productName` filter is not on the subscriptions table itself, but comes
 * from the related products table via prices.
 */
export type SubscriptionTableFilters = SelectConditions<
  typeof subscriptions
> & {
  productName?: string
}

export const selectSubscriptionById = createSelectById(
  subscriptions,
  config
)

const baseInsertSubscription = createInsertFunction(
  subscriptions,
  config
)

export const insertSubscription = async (
  subscriptionInsert: Subscription.Insert,
  transaction: DbTransaction
): Promise<Subscription.Record> => {
  const pricingModelId = subscriptionInsert.pricingModelId
    ? subscriptionInsert.pricingModelId
    : await derivePricingModelIdFromPrice(
        subscriptionInsert.priceId,
        transaction
      )
  return baseInsertSubscription(
    {
      ...subscriptionInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateSubscription = createUpdateFunction(
  subscriptions,
  config
)

/**
 * Selects subscriptions by the given where conditions.
 * This query is used as part of the decomposed subscription fetching strategy
 * in selectRichSubscriptionsAndActiveItems, enabling independent caching of
 * subscription records.
 */
export const selectSubscriptions = createSelectFunction(
  subscriptions,
  config
)

/**
 * Selects subscriptions by customer ID with caching enabled by default.
 * Pass { ignoreCache: true } as the last argument to bypass the cache.
 *
 * This cache entry depends on customerSubscriptions - invalidate when
 * subscriptions for this customer are created, updated, or deleted.
 *
 * Cache key includes livemode to prevent cross-mode data leakage, since RLS
 * filters subscriptions by livemode and the same customer could have different
 * subscriptions in live vs test mode.
 */
export const selectSubscriptionsByCustomerId = cached(
  {
    namespace: RedisKeyNamespace.SubscriptionsByCustomer,
    keyFn: (
      customerId: string,
      _transaction: DbTransaction,
      livemode: boolean
    ) => `${customerId}:${livemode}`,
    schema: subscriptionsSelectSchema.array(),
    dependenciesFn: (customerId: string) => [
      CacheDependency.customerSubscriptions(customerId),
    ],
  },
  async (
    customerId: string,
    transaction: DbTransaction,
    _livemode: boolean
  ) => {
    return selectSubscriptions({ customerId }, transaction)
  }
)

export const isSubscriptionInTerminalState = (
  status: SubscriptionStatus
) => {
  return [
    SubscriptionStatus.Canceled,
    SubscriptionStatus.IncompleteExpired,
  ].includes(status)
}

export const safelyUpdateSubscriptionStatus = async (
  subscription: Subscription.Record,
  status: SubscriptionStatus,
  transaction: DbTransaction
): Promise<Subscription.Record> => {
  if (status === SubscriptionStatus.CreditTrial) {
    throw new Error(
      `Cannot update subscription ${subscription.id} to credit trial status`
    )
  }
  if (subscription.status === status) {
    return subscription
  }
  if (isSubscriptionInTerminalState(subscription.status)) {
    throw new Error(
      `Subscription ${subscription.id} is in terminal state ${subscription.status} and cannot be updated to ${status}`
    )
  }
  if (!subscription.renews) {
    const safeStatus = nonRenewingStatusSchema.safeParse(status)
    if (!safeStatus.success) {
      throw new Error(
        `Subscription ${subscription.id} is a non-renewing subscription and cannot be updated to ${status}`
      )
    }
    const updatedSubscription = await updateSubscription(
      {
        id: subscription.id,
        status: safeStatus.data,
        renews: subscription.renews,
      },
      transaction
    )
    return updatedSubscription
  }

  const updatedSubscription = await updateSubscription(
    { id: subscription.id, status, renews: subscription.renews },
    transaction
  )
  if (updatedSubscription.status === SubscriptionStatus.CreditTrial) {
    throw new Error(
      `Subscription ${subscription.id} was updated to credit trial status. Credit_trial status is a status that can only be created, not updated to.`
    )
  }
  return standardSubscriptionSelectSchema.parse(updatedSubscription)
}

export const selectSubscriptionsToBeCancelled = async (
  {
    rangeStart,
    rangeEnd,
    livemode,
  }: {
    rangeStart: Date
    rangeEnd: Date
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const subscriptionToCancel = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        gte(
          subscriptions.cancelScheduledAt,
          new Date(rangeStart).getTime()
        ),
        lte(
          subscriptions.cancelScheduledAt,
          new Date(rangeEnd).getTime()
        ),
        eq(subscriptions.livemode, livemode)
      )
    )
  return subscriptionToCancel.map((subscription) =>
    subscriptionsSelectSchema.parse(subscription)
  )
}

export const selectSubscriptionsTableRowData =
  createCursorPaginatedSelectFunction(
    subscriptions,
    config,
    subscriptionsTableRowDataSchema,
    async (
      subscriptions: Subscription.Record[],
      transaction: DbTransaction
    ) => {
      const priceIds = subscriptions
        .map((subscription) => subscription.priceId)
        .filter((id): id is string => id !== null)
      const customerIds = subscriptions
        .map((subscription) => subscription.customerId)
        .filter((id): id is string => id !== null)

      // Query 1: Get prices with products
      const priceResults = await transaction
        .select({
          price: prices,
          product: products,
        })
        .from(prices)
        .innerJoin(products, eq(products.id, prices.productId))
        .where(inArray(prices.id, priceIds))

      // Query 2: Get customers
      const customerResults = await transaction
        .select()
        .from(customers)
        .where(inArray(customers.id, customerIds))

      const pricesById = new Map(
        priceResults.map((result) => [result.price.id, result.price])
      )
      const productsById = new Map(
        priceResults.map((result) => [
          result.product.id,
          result.product,
        ])
      )
      const customersById = new Map(
        customerResults.map((customer) => [customer.id, customer])
      )

      return subscriptions.map((subscription) => {
        if (!subscription.priceId || !subscription.customerId) {
          throw new Error(
            `Subscription ${subscription.id} is missing required price or customer ID`
          )
        }

        const price = pricesById.get(subscription.priceId)
        const customer = customersById.get(subscription.customerId)

        if (!price || !customer) {
          throw new Error(
            `Could not find price or customer for subscription ${subscription.id}`
          )
        }

        const product = productsById.get(price.productId)
        if (!product) {
          throw new Error(
            `Could not find product for price ${price.id}`
          )
        }

        return {
          subscription: {
            ...subscription,
            current: isSubscriptionCurrent(
              subscription.status as SubscriptionStatus,
              subscription.cancellationReason
            ),
          },
          price: pricesClientSelectSchema.parse(price),
          product: productsClientSelectSchema.parse(product),
          customer: customerClientSelectSchema.parse(customer),
        }
      })
    },
    // searchableColumns: undefined (no direct column search)
    undefined,
    /**
     * Additional search clause handler for subscription table.
     * Enables searching subscriptions by:
     * - Exact subscription ID match
     * - Customer name (case-insensitive partial match via ILIKE)
     *
     * The `exists()` function wraps a subquery and returns a boolean condition:
     * - Returns `true` if the subquery finds at least one matching row
     * - Returns `false` if the subquery finds zero matching rows
     * The database optimizes EXISTS subqueries to stop evaluating as soon as it finds
     * the first matching row, making it efficient for existence checks without needing JOINs.
     *
     * @param searchQuery - The search query string from the user
     * @param transaction - Database transaction for building subqueries
     * @returns SQL condition for OR-ing with other search filters, or undefined if query is empty
     */
    ({ searchQuery, transaction }) => {
      // FIXME: Consider using a JOIN in the main query builder instead of an EXISTS subquery.
      // This would eliminate the need for the separate customer fetch in the enrichment function
      // (lines 206-210), potentially improving performance by reducing from 2 queries to 1.
      // This would require refactoring `createCursorPaginatedSelectFunction` to support joins
      // in the main query.
      // Normalize the search query by trimming whitespace
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      // Only apply search filter if query is non-empty
      if (!trimmedQuery) return undefined

      // IMPORTANT: Do NOT await this query. By not awaiting, we keep it as a query builder
      // object that Drizzle can embed into the SQL as a subquery. If we await it, it would
      // execute immediately and return data, which we can't use in the EXISTS clause.
      const customerSubquery = transaction
        .select({ id: sql`1` })
        .from(customers)
        .where(
          and(
            eq(customers.id, subscriptions.customerId),
            ilike(customers.name, sql`'%' || ${trimmedQuery} || '%'`)
          )
        )
        // LIMIT 1 is included for clarity - EXISTS automatically stops after finding the first matching row.
        .limit(1)

      return or(
        // Match subscriptions by exact ID
        eq(subscriptions.id, trimmedQuery),
        // Match subscriptions where customer name contains the search query
        // The exists() function checks if the customerSubquery returns at least one row
        exists(customerSubquery)
      )
    },
    /**
     * Additional filter clause handler for subscription table.
     * Enables filtering subscriptions by product name (cross-table filter).
     * The product name is not directly on the subscriptions table, but is
     * accessed via the prices -> products relationship.
     *
     * @param filters - Filter object that may contain productName
     * @returns SQL EXISTS subquery condition, or undefined if no product name filter
     */
    async ({ filters }) => {
      // Type cast to our extended filter type that includes productName
      const typedFilters = filters as
        | SubscriptionTableFilters
        | undefined
      const productNameValue = typedFilters?.productName

      // Normalize product name by trimming whitespace
      const productName =
        typeof productNameValue === 'string'
          ? productNameValue.trim()
          : undefined

      // Return undefined (no filter) if product name is empty or not provided
      if (!productName) return undefined

      // Use EXISTS subquery to filter subscriptions by product name
      // Joins prices -> products to access product name
      return sql`exists (
        select 1 from ${prices} p
        inner join ${products} pr on pr.id = p.product_id
        where p.id = ${subscriptions.priceId}
          and pr.name = ${productName}
      )`
    }
  )

export const selectSubscriptionsPaginated =
  createPaginatedSelectFunction(subscriptions, config)

export const currentSubscriptionStatuses = [
  SubscriptionStatus.Active,
  SubscriptionStatus.PastDue,
  SubscriptionStatus.Trialing,
  SubscriptionStatus.CancellationScheduled,
  SubscriptionStatus.Unpaid,
  SubscriptionStatus.CreditTrial,
]

export const isSubscriptionCurrent = (
  status: SubscriptionStatus,
  cancellationReason?: string | null
) => {
  // Exclude upgraded subscriptions from being considered current
  if (cancellationReason === CancellationReason.UpgradedToPaid) {
    return false
  }

  return currentSubscriptionStatuses.includes(status)
}

export const subscriptionWithCurrent = <
  T extends Omit<Subscription.ClientRecord, 'current'>,
>(
  subscription: T
): T & { current: boolean } => {
  return {
    ...subscription,
    current: isSubscriptionCurrent(
      subscription.status,
      subscription.cancellationReason
    ),
  }
}

export const bulkInsertOrDoNothingSubscriptionsByExternalId = async (
  subscriptionInserts: Subscription.Insert[],
  transaction: DbTransaction
) => {
  const pricingModelIdMap = await pricingModelIdsForPrices(
    subscriptionInserts.map((insert) => insert.priceId),
    transaction
  )
  const subscriptionsWithPricingModelId = subscriptionInserts.map(
    (subscriptionInsert) => {
      const pricingModelId =
        subscriptionInsert.pricingModelId ??
        pricingModelIdMap.get(subscriptionInsert.priceId)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for price ${subscriptionInsert.priceId}`
        )
      }
      return {
        ...subscriptionInsert,
        pricingModelId,
      }
    }
  )
  return transaction
    .insert(subscriptions)
    .values(subscriptionsWithPricingModelId)
    .onConflictDoUpdate({
      target: [
        subscriptions.externalId,
        subscriptions.organizationId,
      ],
      set: {
        priceId: sql`excluded.price_id`,
      },
    })
  // return bulkInsertOrDoNothingSubscriptions(
  //   subscriptionInserts,
  //   [subscriptions.externalId, subscriptions.organizationId],
  //   transaction
  // )
}

export const getActiveSubscriptionsForPeriod = async (
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<Subscription.Record[]> => {
  const subscriptionRecords = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        // Subscription started before the period ended
        lte(subscriptions.startDate, new Date(endDate).getTime()),
        // Subscription was not canceled before the period started
        createDateNotPassedFilter(
          subscriptions.canceledAt,
          new Date(startDate).getTime()
        ),
        // Exclude subscriptions that were upgraded away
        or(
          isNull(subscriptions.cancellationReason),
          ne(
            subscriptions.cancellationReason,
            CancellationReason.UpgradedToPaid
          )
        )
      )
    )

  return subscriptionRecords.map((subscription) =>
    subscriptionsSelectSchema.parse(subscription)
  )
}

export const selectSubscriptionCountsByStatus = async (
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      status: subscriptions.status,
      count: count(),
    })
    .from(subscriptions)
    .groupBy(subscriptions.status)

  return result.map((item) => ({
    status: item.status as SubscriptionStatus,
    count: item.count,
  }))
}

export const selectDistinctSubscriptionProductNames = async (
  organizationId: string,
  transaction: DbTransaction
): Promise<string[]> => {
  const rows = await transaction
    .select({ name: products.name })
    .from(subscriptions)
    .innerJoin(prices, eq(prices.id, subscriptions.priceId))
    .innerJoin(products, eq(products.id, prices.productId))
    .where(eq(subscriptions.organizationId, organizationId))
    .groupBy(products.name)

  const names = rows
    .map((r) => r.name)
    .filter((n): n is string => !!n && n.trim().length > 0)
  // Sort case-insensitively for stable UI ordering
  // Using sensitivity: 'base' makes localeCompare ignore case differences
  names.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
  return names
}

export const safelyUpdateSubscriptionsForCustomerToNewPaymentMethod =
  async (
    paymentMethod: PaymentMethod.Record,
    transaction: DbTransaction
  ) => {
    const subscriptionRecords = await selectSubscriptions(
      {
        customerId: paymentMethod.customerId,
        livemode: paymentMethod.livemode,
        status: currentSubscriptionStatuses,
      },
      transaction
    )
    const updatedSubscriptions = await transaction
      .update(subscriptions)
      .set({
        defaultPaymentMethodId: paymentMethod.id,
      })
      .where(
        inArray(
          subscriptions.id,
          subscriptionRecords.map((subscription) => subscription.id)
        )
      )
      .returning()
    return updatedSubscriptions
  }

/**
 * Derives pricingModelId from a subscription.
 * Used for billingPeriods, billingRuns, subscriptionItems, ledgerTransactions.
 */
export const derivePricingModelIdFromSubscription =
  createDerivePricingModelId(
    subscriptions,
    config,
    selectSubscriptionById
  )

/**
 * Batch fetch pricingModelIds for multiple subscriptions.
 * More efficient than calling derivePricingModelIdFromSubscription for each subscription individually.
 * Used by bulk insert operations in billing periods, billing runs, subscription items, ledger transactions.
 */
export const pricingModelIdsForSubscriptions =
  createDerivePricingModelIds(subscriptions, config)

/**
 * Selects active subscriptions for a customer, excluding those that were upgraded away.
 * This is used throughout the system to ensure only current active subscriptions are considered.
 *
 * @param customerId - The customer ID to query subscriptions for
 * @param transaction - Database transaction
 * @returns Array of active subscriptions that haven't been upgraded away
 */
export const selectActiveSubscriptionsForCustomer = async (
  customerId: string,
  transaction: DbTransaction
): Promise<Subscription.Record[]> => {
  const subscriptionRecords = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customerId),
        eq(subscriptions.status, SubscriptionStatus.Active),
        // Exclude subscriptions that were upgraded away
        or(
          isNull(subscriptions.cancellationReason),
          ne(
            subscriptions.cancellationReason,
            CancellationReason.UpgradedToPaid
          )
        )
      )
    )

  return subscriptionRecords.map((subscription) =>
    subscriptionsSelectSchema.parse(subscription)
  )
}

/**
 * Finds the current subscription for a customer by following the upgrade chain.
 * If a subscription has been replaced (upgraded), follows the chain to find the current one.
 *
 * @param customerId - The customer ID to find the current subscription for
 * @param transaction - Database transaction
 * @returns The current subscription or null if none exists
 */
export const selectCurrentSubscriptionForCustomer = async (
  customerId: string,
  transaction: DbTransaction
): Promise<Subscription.Record | null> => {
  // Get all subscriptions for the customer
  const allSubscriptions = await selectSubscriptions(
    {
      customerId,
    },
    transaction
  )

  if (allSubscriptions.length === 0) {
    return null
  }

  // Helper function to recursively find the end of any upgrade chain
  const findCurrent = (
    sub: Subscription.Record,
    depth = 0
  ): Subscription.Record => {
    // Prevent infinite loops
    if (depth > 10) {
      console.warn(
        `Deep upgrade chain detected for subscription ${sub.id}`
      )
      return sub
    }

    // If this subscription has been replaced, find its replacement
    if (sub.replacedBySubscriptionId) {
      const replacement = allSubscriptions.find(
        (s) => s.id === sub.replacedBySubscriptionId
      )
      // If we found the replacement, continue following the chain
      if (replacement) {
        return findCurrent(replacement, depth + 1)
      }
    }
    // This is the end of the chain (or no replacement found)
    return sub
  }

  // Start by looking for an active subscription that wasn't upgraded away
  const activeNonUpgraded = allSubscriptions.find(
    (s) =>
      currentSubscriptionStatuses.includes(s.status) &&
      s.cancellationReason !== CancellationReason.UpgradedToPaid
  )

  if (activeNonUpgraded) {
    // Make sure this is the end of any upgrade chain
    return findCurrent(activeNonUpgraded)
  }

  // If no active non-upgraded subscription, look for any active subscription
  // and follow its chain (edge case handling)
  const anyActive = allSubscriptions.find(
    (s) => s.status === SubscriptionStatus.Active
  )

  if (anyActive) {
    // If this active subscription was upgraded away, don't return it
    if (
      anyActive.cancellationReason ===
      CancellationReason.UpgradedToPaid
    ) {
      return null
    }
    return findCurrent(anyActive)
  }

  // No active subscriptions found
  return null
}
