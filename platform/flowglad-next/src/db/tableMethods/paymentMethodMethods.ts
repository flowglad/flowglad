import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  createBulkInsertOrDoNothingFunction,
  onConflictDoUpdateSetValues,
} from '@/db/tableUtils'
import {
  PaymentMethod,
  paymentMethods,
  paymentMethodsInsertSchema,
  paymentMethodsSelectSchema,
  paymentMethodsUpdateSchema,
} from '@/db/schema/paymentMethods'
import { DbTransaction } from '../types'
import { eq } from 'drizzle-orm'

const config: ORMMethodCreatorConfig<
  typeof paymentMethods,
  typeof paymentMethodsSelectSchema,
  typeof paymentMethodsInsertSchema,
  typeof paymentMethodsUpdateSchema
> = {
  selectSchema: paymentMethodsSelectSchema,
  insertSchema: paymentMethodsInsertSchema,
  updateSchema: paymentMethodsUpdateSchema,
  tableName: 'payment_methods',
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

const bulkInsertOrDoNothingPaymentMethods =
  createBulkInsertOrDoNothingFunction(paymentMethods, config)

export const bulkInsertOrDoNothingPaymentMethodsByExternalId = async (
  inserts: PaymentMethod.Insert[],
  transaction: DbTransaction
) => {
  return bulkInsertOrDoNothingPaymentMethods(
    inserts,
    [paymentMethods.externalId],
    transaction
  )
}

export const bulkUpsertPaymentMethodsByExternalId = async (
  inserts: PaymentMethod.Insert[],
  transaction: DbTransaction
) => {
  const parsedData = inserts.map((insert) => {
    const result = config.insertSchema.safeParse(insert)
    if (!result.success) {
      throw new Error(result.error.message)
    }
    return result.data
  })
  await transaction
    .insert(paymentMethods)
    .values(parsedData)
    .onConflictDoUpdate({
      target: [paymentMethods.externalId],
      set: onConflictDoUpdateSetValues(paymentMethods, [
        'billing_details',
      ]),
    })
    .returning()
}
