import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  BillingPeriod,
  billingPeriods,
  billingPeriodsInsertSchema,
  billingPeriodsSelectSchema,
  billingPeriodsUpdateSchema,
} from '@/db/schema/billingPeriods'
import { customers, customersSelectSchema } from '../schema/customers'
import { subscriptionsSelectSchema } from '../schema/subscriptions'
import {
  and,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  isNull,
} from 'drizzle-orm'
import { BillingPeriodStatus, CancellationReason } from '@/types'
import { DbTransaction } from '@/db/types'
import { subscriptions } from '../schema/subscriptions'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import { invoices, invoicesSelectSchema } from '../schema/invoices'

const config: ORMMethodCreatorConfig<
  typeof billingPeriods,
  typeof billingPeriodsSelectSchema,
  typeof billingPeriodsInsertSchema,
  typeof billingPeriodsUpdateSchema
> = {
  selectSchema: billingPeriodsSelectSchema,
  insertSchema: billingPeriodsInsertSchema,
  updateSchema: billingPeriodsUpdateSchema,
  tableName: 'billing_periods',
}

export const selectBillingPeriodById = createSelectById(
  billingPeriods,
  config
)

export const insertBillingPeriod = createInsertFunction(
  billingPeriods,
  config
)

export const updateBillingPeriod = createUpdateFunction(
  billingPeriods,
  config
)

export const selectBillingPeriods = createSelectFunction(
  billingPeriods,
  config
)

export const selectBillingPeriodInvoiceSubscriptionWithCustomerAndOrganization =
  async (billingPeriodId: string, transaction: DbTransaction) => {
    const result = await transaction
      .select({
        subscription: subscriptions,
        organization: organizations,
        customer: customers,
        billingPeriod: billingPeriods,
        invoice: invoices,
      })
      .from(billingPeriods)
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
      .innerJoin(
        invoices,
        eq(invoices.billingPeriodId, billingPeriods.id)
      )
      .where(eq(billingPeriods.id, billingPeriodId))

    if (!result[0]) return null
    const {
      subscription,
      organization,
      customer,
      billingPeriod,
      invoice,
    } = result[0]
    return {
      subscription: subscriptionsSelectSchema.parse(subscription),
      organization: organizationsSelectSchema.parse(organization),
      customer: customersSelectSchema.parse(customer),
      billingPeriod: billingPeriodsSelectSchema.parse(billingPeriod),
      invoice: invoicesSelectSchema.parse(invoice),
    }
  }

export const selectBillingPeriodsForSubscriptions = async (
  subscriptionIds: string[],
  transaction: DbTransaction
) => {
  const billingPeriodsForSubscriptions = await transaction
    .select()
    .from(billingPeriods)
    .where(
      and(
        inArray(billingPeriods.subscriptionId, subscriptionIds),
        lt(billingPeriods.startDate, new Date()),
        gte(billingPeriods.endDate, new Date())
      )
    )
  return billingPeriodsForSubscriptions.map((billingPeriod) =>
    billingPeriodsSelectSchema.parse(billingPeriod)
  )
}

export const selectCurrentBillingPeriodForSubscription = async (
  subscriptionId: string,
  transaction: DbTransaction
): Promise<BillingPeriod.Record | null> => {
  const [currentBillingPeriod] =
    await selectBillingPeriodsForSubscriptions(
      [subscriptionId],
      transaction
    )

  if (!currentBillingPeriod) {
    return null
  }
  return currentBillingPeriod
}

export const isBillingPeriodInTerminalState = (
  billingPeriod: BillingPeriod.Record
) => {
  return (
    billingPeriod.status === BillingPeriodStatus.Canceled ||
    billingPeriod.status === BillingPeriodStatus.Completed
  )
}

export const safelyUpdateBillingPeriodStatus = async (
  billingPeriod: BillingPeriod.Record,
  status: BillingPeriodStatus,
  transaction: DbTransaction
) => {
  if (isBillingPeriodInTerminalState(billingPeriod)) {
    return billingPeriod
  }
  if (
    status === BillingPeriodStatus.Upcoming &&
    billingPeriod.startDate < new Date()
  ) {
    throw new Error(
      `Cannot set billing period ${billingPeriod.id} to ${status} if it has already started (startDate: ${billingPeriod.startDate})`
    )
  }

  if (
    status === BillingPeriodStatus.ScheduledToCancel &&
    billingPeriod.startDate < new Date()
  ) {
    throw new Error(
      `Cannot set billing period ${billingPeriod.id} to ${status} if it has already started. Instead, this billing period will be marked as completed. (startDate: ${billingPeriod.startDate})`
    )
  }

  if (
    status === BillingPeriodStatus.Active &&
    billingPeriod.startDate > new Date()
  ) {
    throw new Error(
      `Cannot set billing period ${billingPeriod.id} to ${status} if it has not started yet (startDate: ${billingPeriod.startDate})`
    )
  }

  return updateBillingPeriod(
    { id: billingPeriod.id, status },
    transaction
  )
}

export const selectBillingPeriodsDueForTransition = async (
  { rangeStart, rangeEnd }: { rangeStart: Date; rangeEnd: Date },
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(billingPeriods)
    .where(
      and(
        lte(billingPeriods.endDate, rangeEnd),
        gte(billingPeriods.endDate, rangeStart)
      )
    )

  return result
    .map((billingPeriod) =>
      billingPeriodsSelectSchema.parse(billingPeriod)
    )
    .filter(
      (billingPeriod) =>
        !isBillingPeriodInTerminalState(billingPeriod)
    )
}

export const selectSubscriptionsAndBillingPeriodsDueForNextBillingPeriodCreation =
  async (
    { rangeStart, rangeEnd }: { rangeStart: Date; rangeEnd: Date },
    transaction: DbTransaction
  ) => {
    const result = await transaction
      .select({
        subscription: subscriptions,
        billingPeriod: billingPeriods,
      })
      .from(subscriptions)
      .innerJoin(
        billingPeriods,
        eq(subscriptions.id, billingPeriods.subscriptionId)
      )
      .where(
        and(
          gte(billingPeriods.endDate, rangeStart),
          lte(billingPeriods.endDate, rangeEnd)
        )
      )

    return result.map((row) => ({
      subscription: subscriptionsSelectSchema.parse(row.subscription),
      billingPeriod: billingPeriodsSelectSchema.parse(
        row.billingPeriod
      ),
    }))
  }

/**
 * Selects active billing periods for a date range, excluding those for upgraded subscriptions
 * This is used for billing runs to ensure we don't process billing for subscriptions that have been upgraded
 */
export const selectActiveBillingPeriodsForDateRange = async (
  {
    startDate,
    endDate,
    organizationId,
    livemode,
  }: {
    startDate: Date
    endDate: Date
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      billingPeriod: billingPeriods,
      subscription: subscriptions,
    })
    .from(billingPeriods)
    .innerJoin(
      subscriptions,
      eq(billingPeriods.subscriptionId, subscriptions.id)
    )
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(billingPeriods.livemode, livemode),
        // Exclude billing periods for upgraded subscriptions
        or(
          isNull(subscriptions.cancellationReason),
          ne(
            subscriptions.cancellationReason,
            CancellationReason.UpgradedToPaid
          )
        ),
        // Date range conditions
        lte(billingPeriods.startDate, endDate),
        gte(billingPeriods.endDate, startDate)
      )
    )

  return result.map((row) => ({
    billingPeriod: billingPeriodsSelectSchema.parse(
      row.billingPeriod
    ),
    subscription: subscriptionsSelectSchema.parse(row.subscription),
  }))
}
