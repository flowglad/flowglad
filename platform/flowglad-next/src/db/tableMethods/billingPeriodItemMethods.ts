import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkInsertFunction,
  SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  billingPeriodItems,
  billingPeriodItemsInsertSchema,
  billingPeriodItemsSelectSchema,
  billingPeriodItemsUpdateSchema,
} from '@/db/schema/billingPeriodItems'
import {
  and,
  eq,
  gte,
  lte,
  or,
  between,
  SQL,
  desc,
} from 'drizzle-orm'
import { DbTransaction } from '@/db/types'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import {
  billingPeriods,
  billingPeriodsSelectSchema,
} from '../schema/billingPeriods'
import {
  subscriptions,
  subscriptionsSelectSchema,
} from '../schema/subscriptions'
import { customers, customersSelectSchema } from '../schema/customers'

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

export const insertBillingPeriodItem = createInsertFunction(
  billingPeriodItems,
  config
)

export const updateBillingPeriodItem = createUpdateFunction(
  billingPeriodItems,
  config
)

export const selectBillingPeriodItems = createSelectFunction(
  billingPeriodItems,
  config
)

export const bulkInsertBillingPeriodItems = createBulkInsertFunction(
  billingPeriodItems,
  config
)

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
      .from(billingPeriodItems)
      .innerJoin(
        billingPeriods,
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
      .where(eq(billingPeriodItems.billingPeriodId, billingPeriodId))

    const { organization, subscription, billingPeriod, customer } =
      result[0]
    return {
      organization: organizationsSelectSchema.parse(organization),
      subscription: subscriptionsSelectSchema.parse(subscription),
      billingPeriod: billingPeriodsSelectSchema.parse(billingPeriod),
      billingPeriodItems: result.map((item) =>
        billingPeriodItemsSelectSchema.parse(item.billingPeriodItem)
      ),
      customer: customersSelectSchema.parse(customer),
    }
  }

export const selectBillingPeriodAndItemsForDate = async (
  whereConditions: SelectConditions<typeof billingPeriods>,
  date: Date,
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
        lte(billingPeriods.startDate, date),
        gte(billingPeriods.endDate, date),
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
    startDate: Date,
    endDate: Date,
    transaction: DbTransaction
  ) => {
    // Create the condition to find billing periods that overlap with the date range
    const dateRangeCondition = or(
      // Billing period starts within the date range
      between(billingPeriods.startDate, startDate, endDate),
      // Billing period ends within the date range
      between(billingPeriods.endDate, startDate, endDate),
      // Billing period spans the entire date range
      and(
        lte(billingPeriods.startDate, startDate),
        gte(billingPeriods.endDate, endDate)
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
      .orderBy(desc(billingPeriods.startDate))

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
            subscription: subscriptionsSelectSchema.parse(
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
          billingPeriod: ReturnType<
            typeof billingPeriodsSelectSchema.parse
          >
          subscription: ReturnType<
            typeof subscriptionsSelectSchema.parse
          >
          billingPeriodItems: ReturnType<
            typeof billingPeriodItemsSelectSchema.parse
          >[]
        }
      >
    )

    // Convert the grouped object to an array
    return Object.values(groupedByBillingPeriod)
  }
