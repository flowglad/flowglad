import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
} from 'drizzle-orm'
import {
  type BillingPeriod,
  billingPeriods,
  billingPeriodsInsertSchema,
  billingPeriodsSelectSchema,
  billingPeriodsUpdateSchema,
} from '@/db/schema/billingPeriods'
import {
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { BillingPeriodStatus, CancellationReason } from '@/types'
import { customers, customersSelectSchema } from '../schema/customers'
import { invoices, invoicesSelectSchema } from '../schema/invoices'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import {
  subscriptions,
  subscriptionsSelectSchema,
} from '../schema/subscriptions'
import { derivePricingModelIdFromSubscription } from './subscriptionMethods'

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

/**
 * Derives pricingModelId from a billing period.
 * Used for billing period item inserts.
 */
export const derivePricingModelIdFromBillingPeriod =
  createDerivePricingModelId(
    billingPeriods,
    config,
    async (id, transaction) => {
      const result = await selectBillingPeriodById(id, transaction)
      return result.unwrap()
    }
  )

/**
 * Batch derives pricingModelIds from multiple billing periods.
 * More efficient than calling derivePricingModelIdFromBillingPeriod individually.
 */
export const derivePricingModelIdsFromBillingPeriods =
  createDerivePricingModelIds(billingPeriods, config)

const baseInsertBillingPeriod = createInsertFunction(
  billingPeriods,
  config
)

export const insertBillingPeriod = async (
  billingPeriodInsert: BillingPeriod.Insert,
  transaction: DbTransaction
): Promise<BillingPeriod.Record> => {
  const pricingModelId = billingPeriodInsert.pricingModelId
    ? billingPeriodInsert.pricingModelId
    : await derivePricingModelIdFromSubscription(
        billingPeriodInsert.subscriptionId,
        transaction
      )
  return baseInsertBillingPeriod(
    {
      ...billingPeriodInsert,
      pricingModelId,
    },
    transaction
  )
}

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
        lt(billingPeriods.startDate, new Date().getTime()),
        gte(billingPeriods.endDate, new Date().getTime())
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
    billingPeriod.startDate < Date.now()
  ) {
    throw new Error(
      `Cannot set billing period ${billingPeriod.id} to ${status} if it has already started (startDate: ${billingPeriod.startDate})`
    )
  }

  if (
    status === BillingPeriodStatus.ScheduledToCancel &&
    billingPeriod.startDate < Date.now()
  ) {
    throw new Error(
      `Cannot set billing period ${billingPeriod.id} to ${status} if it has already started. Instead, this billing period will be marked as completed. (startDate: ${billingPeriod.startDate})`
    )
  }

  if (
    status === BillingPeriodStatus.Active &&
    billingPeriod.startDate > Date.now()
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
        lte(billingPeriods.endDate, new Date(rangeEnd).getTime()),
        gte(billingPeriods.endDate, new Date(rangeStart).getTime())
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
          gte(billingPeriods.endDate, new Date(rangeStart).getTime()),
          lte(billingPeriods.endDate, new Date(rangeEnd).getTime())
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
    startDate: Date | number
    endDate: Date | number
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
        lte(billingPeriods.startDate, new Date(endDate).getTime()),
        gte(billingPeriods.endDate, new Date(startDate).getTime())
      )
    )

  return result.map((row) => ({
    billingPeriod: billingPeriodsSelectSchema.parse(
      row.billingPeriod
    ),
    subscription: subscriptionsSelectSchema.parse(row.subscription),
  }))
}
