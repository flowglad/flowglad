import {
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import {
  type UsageMeter,
  usageMeters,
  usageMetersClientSelectSchema,
  usageMetersInsertSchema,
  usageMetersSelectSchema,
  usageMetersTableRowDataSchema,
  usageMetersUpdateSchema,
} from '@/db/schema/usageMeters'
import {
  selectPricingModelForCustomer,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import { selectCustomerById } from './customerMethods'

const config: ORMMethodCreatorConfig<
  typeof usageMeters,
  typeof usageMetersSelectSchema,
  typeof usageMetersInsertSchema,
  typeof usageMetersUpdateSchema
> = {
  selectSchema: usageMetersSelectSchema,
  insertSchema: usageMetersInsertSchema,
  updateSchema: usageMetersUpdateSchema,
  tableName: 'usage_meters',
}

export const selectUsageMeterById = createSelectById(
  usageMeters,
  config
)

/**
 * Derives pricingModelId from a usage meter.
 * Used for usageEvents, usageCredits, ledgerAccounts, subscriptionMeterPeriodCalculations.
 */
export const derivePricingModelIdFromUsageMeter =
  createDerivePricingModelId(
    usageMeters,
    config,
    async (id, transaction) => {
      const result = await selectUsageMeterById(id, transaction)
      if (Result.isError(result)) {
        throw result.error
      }
      return result.value
    }
  )

/**
 * Batch fetch pricingModelIds for multiple usage meters.
 * More efficient than calling derivePricingModelIdFromUsageMeter for each usage meter individually.
 * Used by bulk insert operations in usage events, usage credits, ledger accounts, and subscription meter period calculations.
 */
export const pricingModelIdsForUsageMeters =
  createDerivePricingModelIds(usageMeters, config)

export const selectUsageMeters = createSelectFunction(
  usageMeters,
  config
)

/**
 * Selects usage meters by pricing model ID with caching enabled by default.
 * Pass { ignoreCache: true } as the last argument to bypass the cache.
 *
 * This cache entry depends on pricingModelUsageMeters - invalidate when
 * usage meters for this pricing model are created, updated, or archived.
 *
 * Returns UsageMeter.ClientRecord[] (client-safe schema) for use in customer-facing APIs.
 */
export const selectUsageMetersByPricingModelId = cached(
  {
    namespace: RedisKeyNamespace.UsageMetersByPricingModel,
    keyFn: (pricingModelId: string, _transaction: DbTransaction) =>
      pricingModelId,
    schema: usageMetersClientSelectSchema.array(),
    /**
     * This cache entry depends on two types of dependencies:
     * 1. pricingModelUsageMeters - set membership changes (meters added/removed from pricing model)
     * 2. usageMeter - individual meter content changes (name, slug, etc.)
     *
     * Mutations should invalidate the appropriate dependency:
     * - Creating a meter: invalidate pricingModelUsageMeters (set membership changed)
     * - Updating a meter: invalidate usageMeter (content changed)
     * - Archiving/deleting a meter: invalidate pricingModelUsageMeters (set membership changed)
     */
    dependenciesFn: (
      meters: UsageMeter.ClientRecord[],
      pricingModelId: string
    ) => [
      // Set membership dependency - invalidate when meters are added/removed
      CacheDependency.pricingModelUsageMeters(pricingModelId),
      // Individual meter content dependencies - invalidate when any meter's content changes
      ...meters.map((meter) => CacheDependency.usageMeter(meter.id)),
    ],
  },
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<UsageMeter.ClientRecord[]> => {
    const meters = await selectUsageMeters(
      { pricingModelId },
      transaction
    )
    // Parse through client schema to ensure we return client-safe data
    return meters.map((meter) =>
      usageMetersClientSelectSchema.parse(meter)
    )
  }
)

const baseInsertUsageMeter = createInsertFunction(usageMeters, config)

export const insertUsageMeter = async (
  usageMeter: UsageMeter.Insert,
  ctx: TransactionEffectsContext
): Promise<UsageMeter.Record> => {
  const result = await baseInsertUsageMeter(
    usageMeter,
    ctx.transaction
  )
  // Invalidate set membership - a new meter was added to the pricing model (queued for after commit)
  ctx.invalidateCache(
    CacheDependency.pricingModelUsageMeters(result.pricingModelId)
  )
  return result
}

const baseUpdateUsageMeter = createUpdateFunction(usageMeters, config)

export const updateUsageMeter = async (
  usageMeter: UsageMeter.Update,
  ctx: TransactionEffectsContext
): Promise<UsageMeter.Record> => {
  const result = await baseUpdateUsageMeter(
    usageMeter,
    ctx.transaction
  )
  // Invalidate content - the meter's properties changed (queued for after commit)
  ctx.invalidateCache(CacheDependency.usageMeter(result.id))
  return result
}

const baseBulkInsertOrDoNothingUsageMeters =
  createBulkInsertOrDoNothingFunction(usageMeters, config)

export const bulkInsertOrDoNothingUsageMeters = async (
  inserts: UsageMeter.Insert[],
  conflictTarget: Parameters<
    typeof baseBulkInsertOrDoNothingUsageMeters
  >[1],
  ctx: TransactionEffectsContext
) => {
  const results = await baseBulkInsertOrDoNothingUsageMeters(
    inserts,
    conflictTarget,
    ctx.transaction
  )

  // Invalidate set membership for all affected pricing models (queued for after commit)
  // (bulk insert adds meters to pricing models)
  const pricingModelIds = [
    ...new Set(inserts.map((um) => um.pricingModelId)),
  ]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.pricingModelUsageMeters(pricingModelId)
    )
  }

  return results
}

export const bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId =
  async (
    inserts: UsageMeter.Insert[],
    ctx: TransactionEffectsContext
  ) => {
    return bulkInsertOrDoNothingUsageMeters(
      inserts,
      [
        usageMeters.slug,
        usageMeters.pricingModelId,
        usageMeters.organizationId,
      ],
      ctx
    )
  }

export const selectUsageMetersPaginated =
  createPaginatedSelectFunction(usageMeters, config)

export const selectUsageMetersCursorPaginated =
  createCursorPaginatedSelectFunction(
    usageMeters,
    config,
    usageMetersTableRowDataSchema,
    async (data, transaction) => {
      const pricingModelIds = data.map((item) => item.pricingModelId)
      const pricingModels = await selectPricingModels(
        { id: pricingModelIds },
        transaction
      )
      const pricingModelsById = new Map(
        pricingModels.map((pricingModel) => [
          pricingModel.id,
          pricingModel,
        ])
      )

      return data.map((item) => {
        const pricingModel = pricingModelsById.get(
          item.pricingModelId
        )
        if (!pricingModel) {
          throw new Error(
            `PricingModel not found for usage meter ${item.id}`
          )
        }
        return {
          usageMeter: item,
          pricingModel: {
            id: pricingModel.id,
            name: pricingModel.name,
          },
        }
      })
    },
    // Searchable columns for ILIKE search on name and slug
    [usageMeters.name, usageMeters.slug],
    /**
     * Additional search clause for exact ID match.
     * Combined with base name/slug search via OR.
     */
    ({ searchQuery }) => {
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      if (!trimmedQuery) return undefined

      return eq(usageMeters.id, trimmedQuery)
    }
  )

/**
 * Select a usage meter by slug and customerId (uses the customer's pricing model)
 *
 * @param params - Object containing slug and customerId
 * @param transaction - Database transaction
 * @returns The usage meter client record if found, null otherwise
 */
export const selectUsageMeterBySlugAndCustomerId = async (
  params: { slug: string; customerId: string },
  transaction: DbTransaction
): Promise<UsageMeter.ClientRecord | null> => {
  // First, get the customer to determine their pricing model
  const customer = (
    await selectCustomerById(params.customerId, transaction)
  ).unwrap()

  // Get the pricing model for the customer (includes usage meters)
  const pricingModel = await selectPricingModelForCustomer(
    customer,
    transaction
  )

  // Search through usage meters in the pricing model to find one with matching slug
  const usageMeter = pricingModel.usageMeters.find(
    (meter) => meter.slug === params.slug
  )

  return usageMeter ?? null
}
