import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  SelectConditions,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  CheckoutSession,
  checkoutSessions,
  checkoutSessionsInsertSchema,
  checkoutSessionsSelectSchema,
  checkoutSessionsUpdateSchema,
} from '@/db/schema/checkoutSessions'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import { DbTransaction } from '@/db/types'
import { and, eq, inArray, lt, not } from 'drizzle-orm'
import { feeCalculations } from '../schema/feeCalculations'

const config: ORMMethodCreatorConfig<
  typeof checkoutSessions,
  typeof checkoutSessionsSelectSchema,
  typeof checkoutSessionsInsertSchema,
  typeof checkoutSessionsUpdateSchema
> = {
  selectSchema: checkoutSessionsSelectSchema,
  insertSchema: checkoutSessionsInsertSchema,
  updateSchema: checkoutSessionsUpdateSchema,
}

export const selectCheckoutSessionById = createSelectById(
  checkoutSessions,
  config
)

export const insertCheckoutSession = createInsertFunction(
  checkoutSessions,
  config
)

export const updateCheckoutSession = createUpdateFunction(
  checkoutSessions,
  config
)

export const selectCheckoutSessions = createSelectFunction(
  checkoutSessions,
  config
)

export const deleteExpiredCheckoutSessionsAndFeeCalculations = async (
  transaction: DbTransaction
) => {
  const expiredCheckoutSessions = await transaction
    .select()
    .from(checkoutSessions)
    .where(
      and(
        lt(checkoutSessions.expires, new Date()),
        not(
          inArray(checkoutSessions.status, [
            CheckoutSessionStatus.Succeeded,
            CheckoutSessionStatus.Pending,
          ])
        )
      )
    )
  const expiredFeeCalculations = await transaction
    .select()
    .from(feeCalculations)
    .where(
      inArray(
        feeCalculations.checkoutSessionId,
        expiredCheckoutSessions.map((session) => session.id)
      )
    )
  await transaction.delete(feeCalculations).where(
    inArray(
      feeCalculations.id,
      expiredFeeCalculations.map((calculation) => calculation.id)
    )
  )
  await transaction.delete(checkoutSessions).where(
    inArray(
      checkoutSessions.id,
      expiredCheckoutSessions.map((session) => session.id)
    )
  )
  return expiredCheckoutSessions
}

export const selectOpenNonExpiredCheckoutSessions = async (
  where: SelectConditions<typeof checkoutSessions>,
  transaction: DbTransaction
) => {
  const sessions = await selectCheckoutSessions(
    {
      ...where,
      status: CheckoutSessionStatus.Open,
    },
    transaction
  )
  return sessions
    .filter((session) => session.expires > new Date())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export const bulkUpdateCheckoutSessions = async (
  data: Omit<CheckoutSession.Update, 'id'>,
  ids: string[],
  transaction: DbTransaction
) => {
  const result = await transaction
    .update(checkoutSessions)
    .set(data)
    .where(inArray(checkoutSessions.id, ids))
  return result.map((data) => config.selectSchema.parse(data))
}

export const selectCheckoutSessionsPaginated =
  createPaginatedSelectFunction(checkoutSessions, config)

export const updateCheckoutSessionsForOpenPurchase = async (
  {
    purchaseId,
    stripePaymentIntentId,
  }: { purchaseId: string; stripePaymentIntentId: string },
  transaction: DbTransaction
) => {
  await transaction
    .update(checkoutSessions)
    .set({
      status: CheckoutSessionStatus.Open,
      stripePaymentIntentId,
    })
    .where(
      and(
        eq(checkoutSessions.purchaseId, purchaseId),
        eq(checkoutSessions.type, CheckoutSessionType.Purchase),
        eq(checkoutSessions.status, CheckoutSessionStatus.Open)
      )
    )
}

/**
 * This is a "scorched earth" operation that deletes all the incomplete purchase sessions for an invoice.
 * It's used when the billing state of an invoice is updated,
 * and we need to invalidate the associated payment intents.
 * @param invoiceId
 * @param transaction
 */
export const deleteIncompleteCheckoutSessionsForInvoice = async (
  invoiceId: string,
  transaction: DbTransaction
) => {
  await transaction
    .delete(checkoutSessions)
    .where(
      and(
        eq(checkoutSessions.invoiceId, invoiceId),
        inArray(checkoutSessions.status, [
          CheckoutSessionStatus.Open,
          CheckoutSessionStatus.Pending,
        ])
      )
    )
}

export const terminalCheckoutSessionStatuses = [
  CheckoutSessionStatus.Succeeded,
  CheckoutSessionStatus.Failed,
  CheckoutSessionStatus.Expired,
]

export const checkouSessionIsInTerminalState = (
  checkoutSession: CheckoutSession.Record
) => {
  return terminalCheckoutSessionStatuses.includes(
    checkoutSession.status
  )
}

export const safelyUpdateCheckoutSessionStatus = async (
  checkoutSession: CheckoutSession.Record,
  status: CheckoutSessionStatus,
  transaction: DbTransaction
) => {
  if (checkoutSession.status === status) {
    return checkoutSession
  }
  if (checkouSessionIsInTerminalState(checkoutSession)) {
    throw new Error(
      `Cannot update checkout session ${checkoutSession.id} status to ${status} because it is in terminal state ${checkoutSession.status}`
    )
  }
  return updateCheckoutSession(
    {
      ...checkoutSession,
      status,
    },
    transaction
  )
}
