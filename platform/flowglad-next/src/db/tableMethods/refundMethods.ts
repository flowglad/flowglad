import {
  type Refund,
  refunds,
  refundsInsertSchema,
  refundsSelectSchema,
  refundsUpdateSchema,
} from '@db-core/schema/refunds'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import type { DbTransaction } from '@/db/types'
import { panic } from '@/errors'
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
 * Derives pricingModelId from a payment.
 * Used for refund inserts.
 */
export const derivePricingModelIdFromPayment = async (
  paymentId: string,
  transaction: DbTransaction
): Promise<string> => {
  const payment = (
    await selectPaymentById(paymentId, transaction)
  ).unwrap()
  if (!payment.pricingModelId) {
    panic(`Payment ${paymentId} does not have a pricingModelId`)
  }
  return payment.pricingModelId
}

const baseInsertRefund = createInsertFunction(refunds, config)

export const insertRefund = async (
  insertData: Refund.Insert,
  transaction: DbTransaction
): Promise<Refund.Record> => {
  const pricingModelId = insertData.pricingModelId
    ? insertData.pricingModelId
    : await derivePricingModelIdFromPayment(
        insertData.paymentId,
        transaction
      )
  return baseInsertRefund(
    {
      ...insertData,
      pricingModelId,
    },
    transaction
  )
}

export const updateRefund = createUpdateFunction(refunds, config)
export const selectRefunds = createSelectFunction(refunds, config)
