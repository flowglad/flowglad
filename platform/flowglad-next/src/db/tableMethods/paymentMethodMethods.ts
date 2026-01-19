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
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '../types'
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

/**
 * Selects payment methods by customer ID with caching enabled by default.
 * Pass { ignoreCache: true } as the last argument to bypass the cache.
 *
 * This cache entry depends on customerPaymentMethods - invalidate when
 * payment methods for this customer are created, updated, or deleted.
 *
 * Cache key includes livemode to prevent cross-mode data leakage, since RLS
 * filters payment methods by livemode and the same customer could have different
 * payment methods in live vs test mode.
 */
export const selectPaymentMethodsByCustomerId = cached(
  {
    namespace: RedisKeyNamespace.PaymentMethodsByCustomer,
    keyFn: (
      customerId: string,
      _transaction: DbTransaction,
      livemode: boolean
    ) => `${customerId}:${livemode}`,
    schema: paymentMethodsSelectSchema.array(),
    dependenciesFn: (paymentMethods, customerId: string) => [
      // Set membership: invalidate when payment methods are added/removed for this customer
      CacheDependency.customerPaymentMethods(customerId),
      // Content: invalidate when any payment method's properties change
      ...paymentMethods.map((pm) =>
        CacheDependency.paymentMethod(pm.id)
      ),
    ],
  },
  async (
    customerId: string,
    transaction: DbTransaction,
    // livemode is used by keyFn for cache key generation, not in the query itself
    // (RLS filters by livemode context set on the transaction)
    _livemode: boolean
  ) => {
    return selectPaymentMethods({ customerId }, transaction)
  }
)

export const selectPaymentMethodsPaginated =
  createPaginatedSelectFunction(paymentMethods, config)

const setPaymentMethodsForCustomerToNonDefault = async (
  customerId: string,
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
  // Get all payment methods that will be changed before updating
  const paymentMethodsToUpdate = await selectPaymentMethods(
    { customerId, default: true },
    transaction
  )
  await transaction
    .update(paymentMethods)
    .set({ default: false })
    .where(eq(paymentMethods.customerId, customerId))
  // Invalidate content for each payment method that was changed
  for (const pm of paymentMethodsToUpdate) {
    invalidateCache(CacheDependency.paymentMethod(pm.id))
  }
}

export const safelyUpdatePaymentMethod = async (
  paymentMethod: PaymentMethod.Update,
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
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
      ctx
    )
  }
  const updatedPaymentMethod = await updatePaymentMethod(
    paymentMethod,
    transaction
  )
  // Invalidate content for the updated payment method
  invalidateCache(CacheDependency.paymentMethod(paymentMethod.id))
  return updatedPaymentMethod
}

export const safelyInsertPaymentMethod = async (
  paymentMethod: PaymentMethod.Insert,
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
  if (paymentMethod.default) {
    await setPaymentMethodsForCustomerToNonDefault(
      paymentMethod.customerId,
      ctx
    )
  }
  const insertedPaymentMethod = await dangerouslyInsertPaymentMethod(
    paymentMethod,
    transaction
  )
  // Invalidate set membership for customer's payment methods collection
  invalidateCache(
    CacheDependency.customerPaymentMethods(paymentMethod.customerId)
  )
  return insertedPaymentMethod
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
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
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

  // Invalidate cache for all affected customers
  const uniqueCustomerIds = Array.from(
    new Set(inserts.map((insert) => insert.customerId))
  )
  for (const customerId of uniqueCustomerIds) {
    invalidateCache(
      CacheDependency.customerPaymentMethods(customerId)
    )
  }
}
