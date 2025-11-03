import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  billingRuns,
  billingRunsInsertSchema,
  billingRunsSelectSchema,
  billingRunsUpdateSchema,
} from '@/db/schema/billingRuns'
import { BillingRunStatus, SubscriptionStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { eq, and, lt } from 'drizzle-orm'
import { selectSubscriptionById } from './subscriptionMethods'
import { z } from 'zod'

const config: ORMMethodCreatorConfig<
  typeof billingRuns,
  typeof billingRunsSelectSchema,
  typeof billingRunsInsertSchema,
  typeof billingRunsUpdateSchema
> = {
  selectSchema: billingRunsSelectSchema,
  insertSchema: billingRunsInsertSchema,
  updateSchema: billingRunsUpdateSchema,
  tableName: 'billing_runs',
}

export const selectBillingRunById = createSelectById(
  billingRuns,
  config
)

const dangerouslyInsertBillingRun = createInsertFunction(
  billingRuns,
  config
)

export const safelyInsertBillingRun = async (
  insert: z.infer<typeof billingRunsInsertSchema>,
  transaction: DbTransaction
) => {
  const subscription = await selectSubscriptionById(
    insert.subscriptionId,
    transaction
  )
  if (subscription.status === SubscriptionStatus.Canceled) {
    throw new Error(
      'Cannot create billing run for canceled subscription'
    )
  }
  return dangerouslyInsertBillingRun(insert, transaction)
}

export const updateBillingRun = createUpdateFunction(
  billingRuns,
  config
)

export const selectBillingRuns = createSelectFunction(
  billingRuns,
  config
)

export const selectBillingRunsDueForExecution = async (
  { livemode }: { livemode: boolean },
  transaction: DbTransaction
) => {
  const now = Date.now()
  const result = await transaction
    .select()
    .from(billingRuns)
    .where(
      and(
        eq(billingRuns.status, BillingRunStatus.Scheduled),
        lt(billingRuns.scheduledFor, now),
        eq(billingRuns.livemode, livemode)
      )
    )
  return result.map((billingRun) =>
    billingRunsSelectSchema.parse(billingRun)
  )
}
