<<<<<<< HEAD
import { BillingRunStatus, SubscriptionStatus } from '@db-core/enums'
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
=======
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import { and, eq, lt } from 'drizzle-orm'
import type { z } from 'zod'
import {
  type BillingRun,
  billingRuns,
  billingRunsInsertSchema,
  billingRunsSelectSchema,
  billingRunsUpdateSchema,
} from '@/db/schema/billingRuns'
import type { DbTransaction } from '@/db/types'
import { ValidationError } from '@/errors'
import { selectSubscriptionById } from './subscriptionMethods'

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
): Promise<Result<BillingRun.Record, ValidationError>> => {
  const subscription = (
    await selectSubscriptionById(insert.subscriptionId, transaction)
  ).unwrap()
  if (subscription.status === SubscriptionStatus.Canceled) {
    return Result.err(
      new ValidationError(
        'subscription',
        'Cannot create billing run for canceled subscription'
      )
    )
  }
  if (subscription.doNotCharge) {
    return Result.err(
      new ValidationError(
        'subscription',
        'Cannot create billing run for doNotCharge subscription'
      )
    )
  }
  const pricingModelId = subscription.pricingModelId
  return Result.ok(
    await dangerouslyInsertBillingRun(
      {
        ...insert,
        pricingModelId,
      },
      transaction
    )
  )
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
