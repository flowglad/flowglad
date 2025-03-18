import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  PaymentMethod,
  paymentMethods,
  paymentMethodsInsertSchema,
  paymentMethodsSelectSchema,
  paymentMethodsUpdateSchema,
} from '@/db/schema/paymentMethods'
import { DbTransaction } from '../types'
import db from '../client'
import { eq, inArray } from 'drizzle-orm'

const config: ORMMethodCreatorConfig<
  typeof paymentMethods,
  typeof paymentMethodsSelectSchema,
  typeof paymentMethodsInsertSchema,
  typeof paymentMethodsUpdateSchema
> = {
  selectSchema: paymentMethodsSelectSchema,
  insertSchema: paymentMethodsInsertSchema,
  updateSchema: paymentMethodsUpdateSchema,
}

export const selectPaymentMethodById = createSelectById(
  paymentMethods,
  config
)

export const dangerouslyInsertPaymentMethod = createInsertFunction(
  paymentMethods,
  config
)

export const updatePaymentMethod = createUpdateFunction(
  paymentMethods,
  config
)

export const selectPaymentMethods = createSelectFunction(
  paymentMethods,
  config
)

export const selectPaymentMethodsPaginated =
  createPaginatedSelectFunction(paymentMethods, config)

const setPaymentMethodsForCustomerToNonDefault = async (
  customerId: string,
  transaction: DbTransaction
) => {
  await transaction
    .update(paymentMethods)
    .set({ default: false })
    .where(eq(paymentMethods.customerId, customerId))
}

export const safelyUpdatePaymentMethod = async (
  paymentMethod: PaymentMethod.Update,
  transaction: DbTransaction
) => {
  /**
   * If payment method is default
   */
  if (paymentMethod.default) {
    const existingPaymentMethod = await selectPaymentMethodById(
      paymentMethod.id,
      transaction
    )
    await setPaymentMethodsForCustomerToNonDefault(
      existingPaymentMethod.customerId,
      transaction
    )
  }
  return updatePaymentMethod(paymentMethod, transaction)
}

export const safelyInsertPaymentMethod = async (
  paymentMethod: PaymentMethod.Insert,
  transaction: DbTransaction
) => {
  if (paymentMethod.default) {
    await setPaymentMethodsForCustomerToNonDefault(
      paymentMethod.customerId,
      transaction
    )
  }
  return dangerouslyInsertPaymentMethod(paymentMethod, transaction)
}
