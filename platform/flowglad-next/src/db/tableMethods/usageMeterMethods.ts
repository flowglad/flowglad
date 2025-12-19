import {
  type UsageMeter,
  usageMeters,
  usageMetersInsertSchema,
  usageMetersSelectSchema,
  usageMetersTableRowDataSchema,
  usageMetersUpdateSchema,
} from '@/db/schema/usageMeters'
import {
  selectPricingModelForCustomer,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import {
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
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

export const insertUsageMeter = createInsertFunction(
  usageMeters,
  config
)

export const updateUsageMeter = createUpdateFunction(
  usageMeters,
  config
)

export const selectUsageMeters = createSelectFunction(
  usageMeters,
  config
)

export const bulkInsertOrDoNothingUsageMeters =
  createBulkInsertOrDoNothingFunction(usageMeters, config)

export const bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId =
  async (
    inserts: UsageMeter.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingUsageMeters(
      inserts,
      [
        usageMeters.slug,
        usageMeters.pricingModelId,
        usageMeters.organizationId,
      ],
      transaction
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
    }
  )

/**
 * Select a usage meter by slug and customerId (uses the customer's pricing model)
 *
 * @param params - Object containing slug and customerId
 * @param transaction - Database transaction
 * @returns The usage meter client record if found, null otherwise
 * @throws {Error} If the customer's pricing model cannot be found (e.g., no default pricing model exists for the organization)
 */
export const selectUsageMeterBySlugAndCustomerId = async (
  params: { slug: string; customerId: string },
  transaction: DbTransaction
): Promise<UsageMeter.ClientRecord | null> => {
  // First, get the customer to determine their pricing model
  const customer = await selectCustomerById(
    params.customerId,
    transaction
  )

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
