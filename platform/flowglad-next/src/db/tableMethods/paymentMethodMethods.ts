import { eq } from 'drizzle-orm'
import {
  type PaymentMethod,
  paymentMethods,
  paymentMethodsInsertSchema,
  paymentMethodsSelectSchema,
  paymentMethodsUpdateSchema,
} from '@/db/schema/paymentMethods'
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  onConflictDoUpdateSetValues,
} from '@/db/tableUtils'
import type { DbTransaction } from '../types'
import {
  derivePricingModelIdFromCustomer,
  pricingModelIdsForCustomers,
} from './customerMethods'

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

const baseDangerouslyInsertPaymentMethod = createInsertFunction(
  paymentMethods,
  config
)

export const dangerouslyInsertPaymentMethod = async (
  insertData: PaymentMethod.Insert,
  transaction: DbTransaction
): Promise<PaymentMethod.Record> => {
  // Honor provided pricingModelId, otherwise derive from customer
  const pricingModelId =
    insertData.pricingModelId ??
    (await derivePricingModelIdFromCustomer(
      insertData.customerId,
      transaction
    ))
  return baseDangerouslyInsertPaymentMethod(
    {
      ...insertData,
      pricingModelId,
    },
    transaction
  )
}

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
  // Collect unique customerIds that need pricingModelId derivation
  const customerIdsNeedingDerivation = Array.from(
    new Set(
      inserts
        .filter((insert) => !insert.pricingModelId)
        .map((insert) => insert.customerId)
    )
  )

  // Batch fetch pricing model IDs for customers that need it
  const pricingModelIdMap = await pricingModelIdsForCustomers(
    customerIdsNeedingDerivation,
    transaction
  )

  const insertsWithPricingModelId = inserts.map((insert) => {
    // Honor provided pricingModelId, otherwise get from batch-fetched map
    const pricingModelId =
      insert.pricingModelId ??
      pricingModelIdMap.get(insert.customerId)
    if (!pricingModelId) {
      throw new Error(
        `Customer ${insert.customerId} does not have a pricingModelId`
      )
    }
    return {
      ...insert,
      pricingModelId,
    }
  })

  return bulkInsertOrDoNothingPaymentMethods(
    insertsWithPricingModelId,
    [paymentMethods.externalId, paymentMethods.pricingModelId],
    transaction
  )
}

export const bulkUpsertPaymentMethodsByExternalId = async (
  inserts: PaymentMethod.Insert[],
  transaction: DbTransaction
) => {
  // Collect unique customerIds that need pricingModelId derivation
  const customerIdsNeedingDerivation = Array.from(
    new Set(
      inserts
        .filter((insert) => !insert.pricingModelId)
        .map((insert) => insert.customerId)
    )
  )

  // Batch fetch pricing model IDs for customers that need it
  const pricingModelIdMap = await pricingModelIdsForCustomers(
    customerIdsNeedingDerivation,
    transaction
  )

  const insertsWithPricingModelId = inserts.map((insert) => {
    // Honor provided pricingModelId, otherwise get from batch-fetched map
    const pricingModelId =
      insert.pricingModelId ??
      pricingModelIdMap.get(insert.customerId)
    if (!pricingModelId) {
      throw new Error(
        `Customer ${insert.customerId} does not have a pricingModelId`
      )
    }
    return {
      ...insert,
      pricingModelId,
    }
  })

  const parsedData = insertsWithPricingModelId.map((insert) => {
    const result = config.insertSchema.safeParse(insert)
    if (!result.success) {
      throw new Error(result.error.message)
    }
    // pricingModelId is guaranteed to be set from insertsWithPricingModelId
    return result.data as PaymentMethod.Insert & {
      pricingModelId: string
    }
  })

  await transaction
    .insert(paymentMethods)
    .values(parsedData)
    .onConflictDoUpdate({
      target: [
        paymentMethods.externalId,
        paymentMethods.pricingModelId,
      ],
      set: onConflictDoUpdateSetValues(paymentMethods, [
        'billing_details',
      ]),
    })
    .returning()
}
