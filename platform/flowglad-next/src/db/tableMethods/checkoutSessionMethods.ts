import { Result } from 'better-result'
import { and, eq, inArray, lt, not } from 'drizzle-orm'
import {
  type CheckoutSession,
  checkoutSessions,
  checkoutSessionsInsertSchema,
  checkoutSessionsSelectSchema,
  checkoutSessionsUpdateSchema,
} from '@/db/schema/checkoutSessions'
import {
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  NotFoundError,
  type ORMMethodCreatorConfig,
  type SelectConditions,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { TerminalStateError, ValidationError } from '@/errors'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import { feeCalculations } from '../schema/feeCalculations'
import { selectCustomerById } from './customerMethods'
import { selectInvoiceById } from './invoiceMethods'
import { derivePricingModelIdFromPrice } from './priceMethods'
import { derivePricingModelIdFromPurchase } from './purchaseMethods'

const CHECKOUT_SESSION_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

const config: ORMMethodCreatorConfig<
  typeof checkoutSessions,
  typeof checkoutSessionsSelectSchema,
  typeof checkoutSessionsInsertSchema,
  typeof checkoutSessionsUpdateSchema
> = {
  selectSchema: checkoutSessionsSelectSchema,
  insertSchema: checkoutSessionsInsertSchema,
  updateSchema: checkoutSessionsUpdateSchema,
  tableName: 'checkout_sessions',
}

export const selectCheckoutSessionById = createSelectById(
  checkoutSessions,
  config
)

/**
 * Derives pricingModelId for a checkout session with complex COALESCE logic.
 * Priority: priceId > purchaseId > invoiceId > customerId (for AddPaymentMethod)
 * Used for checkout session inserts.
 */
export const derivePricingModelIdForCheckoutSession = async (
  data: {
    priceId?: string | null
    purchaseId?: string | null
    invoiceId?: string | null
    customerId?: string | null
    type: CheckoutSessionType
  },
  transaction: DbTransaction
): Promise<Result<string, ValidationError>> => {
  // Try price first (for Product and ActivateSubscription sessions)
  if (data.priceId) {
    return Result.ok(
      await derivePricingModelIdFromPrice(data.priceId, transaction)
    )
  }

  // Try purchase second (for Purchase sessions)
  if (data.purchaseId) {
    return Result.ok(
      await derivePricingModelIdFromPurchase(
        data.purchaseId,
        transaction
      )
    )
  }

  // Try invoice third (for Invoice sessions)
  if (data.invoiceId) {
    // Invoice already has pricingModelId from Wave 3
    const invoice = (
      await selectInvoiceById(data.invoiceId, transaction)
    ).unwrap()
    return Result.ok(invoice.pricingModelId)
  }

  // Fall back to customer (for AddPaymentMethod sessions)
  if (
    data.customerId &&
    data.type === CheckoutSessionType.AddPaymentMethod
  ) {
    const customer = (
      await selectCustomerById(data.customerId, transaction)
    ).unwrap()
    if (!customer.pricingModelId) {
      return Result.err(
        new ValidationError(
          'customer',
          `Customer ${data.customerId} does not have a pricingModelId`
        )
      )
    }
    return Result.ok(customer.pricingModelId)
  }

  return Result.err(
    new ValidationError(
      'checkoutSession',
      'Cannot derive pricingModelId for checkout session: no valid parent found'
    )
  )
}

const baseInsertCheckoutSession = createInsertFunction(
  checkoutSessions,
  config
)

export const insertCheckoutSession = async (
  insertData: CheckoutSession.Insert,
  transaction: DbTransaction
): Promise<Result<CheckoutSession.Record, ValidationError>> => {
  if (insertData.pricingModelId) {
    return Result.ok(
      await baseInsertCheckoutSession(insertData, transaction)
    )
  }

  const pricingModelIdResult =
    await derivePricingModelIdForCheckoutSession(
      {
        priceId: insertData.priceId,
        purchaseId: insertData.purchaseId,
        invoiceId: insertData.invoiceId,
        customerId: insertData.customerId,
        type: insertData.type,
      },
      transaction
    )

  if (pricingModelIdResult.status === 'error') {
    return Result.err(pricingModelIdResult.error)
  }

  return Result.ok(
    await baseInsertCheckoutSession(
      {
        ...insertData,
        pricingModelId: pricingModelIdResult.value,
      } as CheckoutSession.Insert,
      transaction
    )
  )
}

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
  const retentionCutoff = new Date(
    Date.now() - CHECKOUT_SESSION_RETENTION_MS
  )
  const expiredCheckoutSessions = await transaction
    .select()
    .from(checkoutSessions)
    .where(
      and(
        lt(
          checkoutSessions.createdAt,
          new Date(retentionCutoff).getTime()
        ),
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
    .filter((session) => session.expires > Date.now())
    .sort((a, b) => b.createdAt - a.createdAt)
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

export const checkoutSessionIsInTerminalState = (
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
): Promise<Result<CheckoutSession.Record, TerminalStateError>> => {
  if (checkoutSession.status === status) {
    return Result.ok(checkoutSession)
  }
  if (checkoutSessionIsInTerminalState(checkoutSession)) {
    return Result.err(
      new TerminalStateError(
        'CheckoutSession',
        checkoutSession.id,
        checkoutSession.status
      )
    )
  }
  return Result.ok(
    await updateCheckoutSession(
      {
        ...checkoutSession,
        status,
      },
      transaction
    )
  )
}

export const updateCheckoutSessionPaymentMethodType = async (
  update: Pick<CheckoutSession.Record, 'id' | 'paymentMethodType'>,
  transaction: DbTransaction
): Promise<CheckoutSession.Record> => {
  const [checkoutSession] = await transaction
    .update(checkoutSessions)
    .set({
      paymentMethodType: update.paymentMethodType,
    })
    .where(eq(checkoutSessions.id, update.id))
    .returning()
  return checkoutSessionsSelectSchema.parse(checkoutSession)
}

export const updateCheckoutSessionCustomerEmail = async (
  update: Pick<CheckoutSession.Record, 'id' | 'customerEmail'>,
  transaction: DbTransaction
): Promise<
  Result<CheckoutSession.Record, ValidationError | NotFoundError>
> => {
  const checkoutSessionResult = await selectCheckoutSessionById(
    update.id,
    transaction
  )
  if (Result.isError(checkoutSessionResult)) {
    return Result.err(checkoutSessionResult.error)
  }
  const checkoutSession = checkoutSessionResult.value
  if (checkoutSession.status !== CheckoutSessionStatus.Open) {
    return Result.err(
      new ValidationError(
        'checkoutSession',
        'Cannot update customer email for a non-open checkout session'
      )
    )
  }
  const [result] = await transaction
    .update(checkoutSessions)
    .set({
      customerEmail: update.customerEmail,
    })
    .where(eq(checkoutSessions.id, update.id))
    .returning()
  return Result.ok(checkoutSessionsSelectSchema.parse(result))
}

export const updateCheckoutSessionBillingAddress = async (
  update: Pick<CheckoutSession.Record, 'id' | 'billingAddress'>,
  transaction: DbTransaction
): Promise<
  Result<CheckoutSession.Record, ValidationError | NotFoundError>
> => {
  const checkoutSessionResult = await selectCheckoutSessionById(
    update.id,
    transaction
  )
  if (Result.isError(checkoutSessionResult)) {
    return Result.err(checkoutSessionResult.error)
  }
  const checkoutSession = checkoutSessionResult.value
  if (checkoutSession.status !== CheckoutSessionStatus.Open) {
    return Result.err(
      new ValidationError(
        'checkoutSession',
        'Cannot update billing address for a non-open checkout session'
      )
    )
  }
  const [result] = await transaction
    .update(checkoutSessions)
    .set({
      billingAddress: update.billingAddress,
    })
    .where(eq(checkoutSessions.id, update.id))
    .returning()
  return Result.ok(checkoutSessionsSelectSchema.parse(result))
}

export const updateCheckoutSessionAutomaticallyUpdateSubscriptions =
  async (
    update: Pick<
      CheckoutSession.Record,
      'id' | 'automaticallyUpdateSubscriptions'
    >,
    transaction: DbTransaction
  ): Promise<
    Result<CheckoutSession.Record, ValidationError | NotFoundError>
  > => {
    const checkoutSessionResult = await selectCheckoutSessionById(
      update.id,
      transaction
    )
    if (Result.isError(checkoutSessionResult)) {
      return Result.err(checkoutSessionResult.error)
    }
    const checkoutSession = checkoutSessionResult.value
    if (
      checkoutSession.type !== CheckoutSessionType.AddPaymentMethod
    ) {
      return Result.err(
        new ValidationError(
          'checkoutSession',
          'Cannot update automaticallyUpdateSubscriptions for a non-add payment method checkout session'
        )
      )
    }
    if (checkoutSession.status !== CheckoutSessionStatus.Open) {
      return Result.err(
        new ValidationError(
          'checkoutSession',
          'Cannot update automaticallyUpdateSubscriptions for a non-open checkout session'
        )
      )
    }
    const [result] = await transaction
      .update(checkoutSessions)
      .set({
        automaticallyUpdateSubscriptions:
          update.automaticallyUpdateSubscriptions,
      })
      .where(eq(checkoutSessions.id, update.id))
      .returning()

    return Result.ok(checkoutSessionsSelectSchema.parse(result))
  }

const subscriptionCreatingCheckoutSessionTypes = [
  CheckoutSessionType.Product,
  CheckoutSessionType.Purchase,
]

export const isCheckoutSessionSubscriptionCreating = (
  checkoutSession: CheckoutSession.Record
): checkoutSession is CheckoutSession.SubscriptionCreatingRecord => {
  return subscriptionCreatingCheckoutSessionTypes.includes(
    checkoutSession.type
  )
}
