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
import { and, eq, gte, lte } from 'drizzle-orm'
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
import { Bai_Jamjuree } from 'next/font/google'

const config: ORMMethodCreatorConfig<
  typeof billingPeriodItems,
  typeof billingPeriodItemsSelectSchema,
  typeof billingPeriodItemsInsertSchema,
  typeof billingPeriodItemsUpdateSchema
> = {
  selectSchema: billingPeriodItemsSelectSchema,
  insertSchema: billingPeriodItemsInsertSchema,
  updateSchema: billingPeriodItemsUpdateSchema,
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

export const selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationBybillingPeriodId =
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
