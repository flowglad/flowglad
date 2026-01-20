import { Result } from 'better-result'
import {
  type Refund,
  refunds,
  refundsInsertSchema,
  refundsSelectSchema,
  refundsUpdateSchema,
} from '@/db/schema/refunds'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  NotFoundError,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { selectPaymentById } from './paymentMethods'

const config: ORMMethodCreatorConfig<
  typeof refunds,
  typeof refundsSelectSchema,
  typeof refundsInsertSchema,
  typeof refundsUpdateSchema
> = {
  selectSchema: refundsSelectSchema,
  insertSchema: refundsInsertSchema,
  updateSchema: refundsUpdateSchema,
  tableName: 'refunds',
}

export const selectRefundById = createSelectById(refunds, config)

/**
 * Error thrown when a payment does not have a pricingModelId.
 */
export class MissingPricingModelIdError extends Error {
  constructor(public readonly paymentId: string) {
    super(`Payment ${paymentId} does not have a pricingModelId`)
    this.name = 'MissingPricingModelIdError'
  }
}

/**
 * Derives pricingModelId from a payment.
 * Used for refund inserts.
 */
export const derivePricingModelIdFromPayment = async (
  paymentId: string,
  transaction: DbTransaction
): Promise<
  Result<string, NotFoundError | MissingPricingModelIdError>
> => {
  const paymentResult = await selectPaymentById(
    paymentId,
    transaction
  )
  if (paymentResult.status === 'error') {
    return Result.err(paymentResult.error)
  }
  const payment = paymentResult.value
  if (!payment.pricingModelId) {
    return Result.err(new MissingPricingModelIdError(paymentId))
  }
  return Result.ok(payment.pricingModelId)
}

const baseInsertRefund = createInsertFunction(refunds, config)

export const insertRefund = async (
  insertData: Refund.Insert,
  transaction: DbTransaction
): Promise<
  Result<Refund.Record, NotFoundError | MissingPricingModelIdError>
> => {
  let pricingModelId: string
  if (insertData.pricingModelId) {
    pricingModelId = insertData.pricingModelId
  } else {
    const pricingModelIdResult =
      await derivePricingModelIdFromPayment(
        insertData.paymentId,
        transaction
      )
    if (pricingModelIdResult.status === 'error') {
      return Result.err<
        Refund.Record,
        NotFoundError | MissingPricingModelIdError
      >(pricingModelIdResult.error)
    }
    pricingModelId = pricingModelIdResult.value
  }
  const refund = await baseInsertRefund(
    {
      ...insertData,
      pricingModelId,
    },
    transaction
  )
  return Result.ok(refund)
}

export const updateRefund = createUpdateFunction(refunds, config)
export const selectRefunds = createSelectFunction(refunds, config)
