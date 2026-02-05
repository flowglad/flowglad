import {
  type BillingPeriodItem,
  billingPeriodItems,
  billingPeriodItemsInsertSchema,
  billingPeriodItemsSelectSchema,
  billingPeriodItemsUpdateSchema,
} from '@db-core/schema/billingPeriodItems'
import {
  type BillingPeriod,
  billingPeriods,
  billingPeriodsSelectSchema,
} from '@db-core/schema/billingPeriods'
import {
  customers,
  customersSelectSchema,
} from '@db-core/schema/customers'
import {
  organizations,
  organizationsSelectSchema,
} from '@db-core/schema/organizations'
import {
  type Subscription,
  standardSubscriptionSelectSchema,
  subscriptions,
  subscriptionsSelectSchema,
} from '@db-core/schema/subscriptions'
import {
  createBulkInsertFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  lte,
  or,
  SQL,
} from 'drizzle-orm'
import type { DbTransaction } from '@/db/types'
import { NotFoundError, panic } from '@/errors'
import {
  derivePricingModelIdFromBillingPeriod,
  derivePricingModelIdsFromBillingPeriods,
} from './billingPeriodMethods'
import { derivePricingModelIdFromMap } from './pricingModelIdHelpers'

const config: ORMMethodCreatorConfig<
  typeof billingPeriodItems,
  typeof billingPeriodItemsSelectSchema,
  typeof billingPeriodItemsInsertSchema,
  typeof billingPeriodItemsUpdateSchema
> = {
  selectSchema: billingPeriodItemsSelectSchema,
  insertSchema: billingPeriodItemsInsertSchema,
  updateSchema: billingPeriodItemsUpdateSchema,
  tableName: 'billing_period_items',
}

export const selectBillingPeriodItemById = createSelectById(
  billingPeriodItems,
  config
)

const baseInsertBillingPeriodItem = createInsertFunction(
  billingPeriodItems,
  config
)

export const insertBillingPeriodItem = async (
  billingPeriodItemInsert: BillingPeriodItem.Insert,
  transaction: DbTransaction
): Promise<BillingPeriodItem.Record> => {
  const pricingModelId =
    billingPeriodItemInsert.pricingModelId ??
    (await derivePricingModelIdFromBillingPeriod(
      billingPeriodItemInsert.billingPeriodId,
      transaction
    ))
  return baseInsertBillingPeriodItem(
    {
      ...billingPeriodItemInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateBillingPeriodItem = createUpdateFunction(
  billingPeriodItems,
  config
)

export const selectBillingPeriodItems = createSelectFunction(
  billingPeriodItems,
  config
)

const baseBulkInsertBillingPeriodItems = createBulkInsertFunction(
  billingPeriodItems,
  config
)

export const bulkInsertBillingPeriodItems = async (
  inserts: BillingPeriodItem.Insert[],
  transaction: DbTransaction
): Promise<Result<BillingPeriodItem.Record[], NotFoundError>> => {
  // Collect unique billingPeriodIds that need pricingModelId derivation
  const billingPeriodIdsNeedingDerivation = Array.from(
    new Set(
      inserts
        .filter((insert) => !insert.pricingModelId)
        .map((insert) => insert.billingPeriodId)
    )
  )

  // Batch fetch pricingModelIds for all billing periods in one query
  const pricingModelIdMap =
    await derivePricingModelIdsFromBillingPeriods(
      billingPeriodIdsNeedingDerivation,
      transaction
    )

  // Derive pricingModelId using the batch-fetched map
  const insertsWithPricingModelId: BillingPeriodItem.Insert[] = []
  for (const insert of inserts) {
    if (insert.pricingModelId) {
      insertsWithPricingModelId.push(insert)
    } else {
      const pricingModelIdResult = derivePricingModelIdFromMap({
        entityId: insert.billingPeriodId,
        entityType: 'billingPeriod',
        pricingModelIdMap,
      })
      if (Result.isError(pricingModelIdResult)) {
        return Result.err(pricingModelIdResult.error)
      }
      insertsWithPricingModelId.push({
        ...insert,
        pricingModelId: pricingModelIdResult.value,
      })
    }
  }

  const result = await baseBulkInsertBillingPeriodItems(
    insertsWithPricingModelId,
    transaction
  )
  return Result.ok(result)
}

export const selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId =
  async (billingPeriodId: string, transaction: DbTransaction) => {
    const result = await transaction
      .select({
        billingPeriod: billingPeriods,
        subscription: subscriptions,
        organization: organizations,
        billingPeriodItem: billingPeriodItems,
        customer: customers,
      })
      .from(billingPeriods)
      .leftJoin(
        billingPeriodItems,
        eq(billingPeriodItems.billingPeriodId, billingPeriods.id)
      )
      .innerJoin(
        subscriptions,
        eq(billingPeriods.subscriptionId, subscriptions.id)
      )
      .innerJoin(
        organizations,
        eq(subscriptions.organizationId, organizations.id)
      )
      .innerJoin(
        customers,
        eq(subscriptions.customerId, customers.id)
      )
      .where(eq(billingPeriods.id, billingPeriodId))

    if (result.length === 0) {
      panic(`Billing period with id ${billingPeriodId} not found`)
    }

    const { organization, subscription, billingPeriod, customer } =
      result[0]
    return {
      organization: organizationsSelectSchema.parse(organization),
      subscription: subscriptionsSelectSchema.parse(subscription),
      billingPeriod: billingPeriodsSelectSchema.parse(billingPeriod),
      billingPeriodItems: result
        .map((item) => item.billingPeriodItem)
        .filter((item) => item !== null)
        .map((item) => billingPeriodItemsSelectSchema.parse(item)),
      customer: customersSelectSchema.parse(customer),
    }
  }

export const selectBillingPeriodAndItemsForDate = async (
  whereConditions: SelectConditions<typeof billingPeriods>,
  date: Date | number,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      billingPeriod: billingPeriods,
      billingPeriodItems: billingPeriodItems,
    })
    .from(billingPeriods)
    .innerJoin(
      billingPeriodItems,
      eq(billingPeriods.id, billingPeriodItems.billingPeriodId)
    )
    .where(
      and(
        lte(billingPeriods.startDate, new Date(date).getTime()),
        gte(billingPeriods.endDate, new Date(date).getTime()),
        whereClauseFromObject(billingPeriods, whereConditions)
      )
    )
    .limit(1)

  if (!result[0]) return null

  return {
    billingPeriod: billingPeriodsSelectSchema.parse(
      result[0].billingPeriod
    ),
    billingPeriodItems: result.map((item) =>
      billingPeriodItemsSelectSchema.parse(item.billingPeriodItems)
    ),
  }
}

export const selectBillingPeriodAndItemsByBillingPeriodWhere = async (
  whereConditions: SelectConditions<typeof billingPeriods>,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      billingPeriod: billingPeriods,
      billingPeriodItems: billingPeriodItems,
    })
    .from(billingPeriods)
    .innerJoin(
      billingPeriodItems,
      eq(billingPeriods.id, billingPeriodItems.billingPeriodId)
    )
    .where(whereClauseFromObject(billingPeriods, whereConditions))
  if (!result[0]) {
    return null
  }
  const billingPeriod = billingPeriodsSelectSchema.parse(
    result[0].billingPeriod
  )
  return {
    billingPeriod,
    billingPeriodItems: result.map((item) =>
      billingPeriodItemsSelectSchema.parse(item.billingPeriodItems)
    ),
  }
}

/**
 * Retrieves billing periods with their items and subscriptions for an organization that overlap with a date range
 * This efficiently gets all the data needed for revenue calculations in a single query
 *
 * @param organizationId The organization ID
 * @param startDate The start date of the range to check for overlapping billing periods
 * @param endDate The end date of the range to check for overlapping billing periods
 * @param transaction The database transaction
 * @returns An array of objects containing billing period, its items, and the associated subscription
 */
export const selectBillingPeriodsWithItemsAndSubscriptionForDateRange =
  async (
    organizationId: string,
    startDate: Date | number,
    endDate: Date | number,
    transaction: DbTransaction
  ): Promise<
    {
      billingPeriod: BillingPeriod.Record
      subscription: Subscription.StandardRecord
      billingPeriodItems: BillingPeriodItem.Record[]
    }[]
  > => {
    const startDateMs = new Date(startDate).getTime()
    const endDateMs = new Date(endDate).getTime()
    // Create the condition to find billing periods that overlap with the date range
    const dateRangeCondition = or(
      // Billing period starts within the date range
      between(billingPeriods.startDate, startDateMs, endDateMs),
      // Billing period ends within the date range
      between(billingPeriods.endDate, startDateMs, endDateMs),
      // Billing period spans the entire date range
      and(
        lte(billingPeriods.startDate, startDateMs),
        gte(billingPeriods.endDate, endDateMs)
      )
    )

    // Execute the query that joins billing periods, subscription, and billing period items
    const result = await transaction
      .select({
        billingPeriod: billingPeriods,
        subscription: subscriptions,
        billingPeriodItem: billingPeriodItems,
      })
      .from(subscriptions)
      .innerJoin(
        billingPeriods,
        eq(subscriptions.id, billingPeriods.subscriptionId)
      )
      .innerJoin(
        billingPeriodItems,
        eq(billingPeriods.id, billingPeriodItems.billingPeriodId)
      )
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          dateRangeCondition
        )
      )
      .orderBy(
        desc(billingPeriods.startDate),
        asc(billingPeriods.position)
      )

    if (!result.length) {
      return []
    }

    // Group the results by billing period ID
    const groupedByBillingPeriod = result.reduce(
      (acc, row) => {
        const billingPeriodId = row.billingPeriod.id

        if (!acc[billingPeriodId]) {
          acc[billingPeriodId] = {
            billingPeriod: billingPeriodsSelectSchema.parse(
              row.billingPeriod
            ),
            subscription: standardSubscriptionSelectSchema.parse(
              row.subscription
            ),
            billingPeriodItems: [],
          }
        }

        acc[billingPeriodId].billingPeriodItems.push(
          billingPeriodItemsSelectSchema.parse(row.billingPeriodItem)
        )

        return acc
      },
      {} as Record<
        string,
        {
          billingPeriod: BillingPeriod.Record
          subscription: Subscription.StandardRecord
          billingPeriodItems: BillingPeriodItem.Record[]
        }
      >
    )

    // Convert the grouped object to an array
    return Object.values(groupedByBillingPeriod)
  }
