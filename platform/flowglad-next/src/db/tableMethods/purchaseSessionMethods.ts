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
  PurchaseSession,
  purchaseSessions,
  purchaseSessionsInsertSchema,
  purchaseSessionsSelectSchema,
  purchaseSessionsUpdateSchema,
} from '@/db/schema/purchaseSessions'
import { PurchaseSessionStatus, PurchaseSessionType } from '@/types'
import { DbTransaction } from '@/db/types'
import { and, eq, inArray, lt, not } from 'drizzle-orm'
import { feeCalculations } from '../schema/feeCalculations'

const config: ORMMethodCreatorConfig<
  typeof purchaseSessions,
  typeof purchaseSessionsSelectSchema,
  typeof purchaseSessionsInsertSchema,
  typeof purchaseSessionsUpdateSchema
> = {
  selectSchema: purchaseSessionsSelectSchema,
  insertSchema: purchaseSessionsInsertSchema,
  updateSchema: purchaseSessionsUpdateSchema,
}

export const selectPurchaseSessionById = createSelectById(
  purchaseSessions,
  config
)

export const insertPurchaseSession = createInsertFunction(
  purchaseSessions,
  config
)

export const updatePurchaseSession = createUpdateFunction(
  purchaseSessions,
  config
)

export const selectPurchaseSessions = createSelectFunction(
  purchaseSessions,
  config
)

export const deleteExpiredPurchaseSessionsAndFeeCalculations = async (
  transaction: DbTransaction
) => {
  const expiredPurchaseSessions = await transaction
    .select()
    .from(purchaseSessions)
    .where(
      and(
        lt(purchaseSessions.expires, new Date()),
        not(
          inArray(purchaseSessions.status, [
            PurchaseSessionStatus.Succeeded,
            PurchaseSessionStatus.Pending,
          ])
        )
      )
    )
  const expiredFeeCalculations = await transaction
    .select()
    .from(feeCalculations)
    .where(
      inArray(
        feeCalculations.PurchaseSessionId,
        expiredPurchaseSessions.map((session) => session.id)
      )
    )
  await transaction.delete(feeCalculations).where(
    inArray(
      feeCalculations.id,
      expiredFeeCalculations.map((calculation) => calculation.id)
    )
  )
  await transaction.delete(purchaseSessions).where(
    inArray(
      purchaseSessions.id,
      expiredPurchaseSessions.map((session) => session.id)
    )
  )
  return expiredPurchaseSessions
}

export const selectOpenNonExpiredPurchaseSessions = async (
  where: SelectConditions<typeof purchaseSessions>,
  transaction: DbTransaction
) => {
  const sessions = await selectPurchaseSessions(
    {
      ...where,
      status: PurchaseSessionStatus.Open,
    },
    transaction
  )
  return sessions
    .filter((session) => session.expires > new Date())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export const bulkUpdatePurchaseSessions = async (
  data: Omit<PurchaseSession.Update, 'id'>,
  ids: string[],
  transaction: DbTransaction
) => {
  const result = await transaction
    .update(purchaseSessions)
    .set(data)
    .where(inArray(purchaseSessions.id, ids))
  return result.map((data) => config.selectSchema.parse(data))
}

export const selectPurchaseSessionsPaginated =
  createPaginatedSelectFunction(purchaseSessions, config)

export const updatePurchaseSessionsForOpenPurchase = async (
  {
    purchaseId,
    stripePaymentIntentId,
  }: { purchaseId: string; stripePaymentIntentId: string },
  transaction: DbTransaction
) => {
  await transaction
    .update(purchaseSessions)
    .set({
      status: PurchaseSessionStatus.Open,
      stripePaymentIntentId,
    })
    .where(
      and(
        eq(purchaseSessions.purchaseId, purchaseId),
        eq(purchaseSessions.type, PurchaseSessionType.Purchase),
        eq(purchaseSessions.status, PurchaseSessionStatus.Open)
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
export const deleteIncompletePurchaseSessionsForInvoice = async (
  invoiceId: string,
  transaction: DbTransaction
) => {
  await transaction
    .delete(purchaseSessions)
    .where(
      and(
        eq(purchaseSessions.invoiceId, invoiceId),
        inArray(purchaseSessions.status, [
          PurchaseSessionStatus.Open,
          PurchaseSessionStatus.Pending,
        ])
      )
    )
}
