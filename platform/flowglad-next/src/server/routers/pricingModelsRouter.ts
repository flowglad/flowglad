import { protectedProcedure, router } from '@/server/trpc'
import {
  pricingModelsClientSelectSchema,
  pricingModelsPaginatedListSchema,
  pricingModelsPaginatedSelectSchema,
  createPricingModelSchema,
  editPricingModelSchema,
  clonePricingModelInputSchema,
} from '@/db/schema/pricingModels'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  insertPricingModel,
  selectPricingModelsPaginated,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
  selectPricingModelsTableRows,
  safelyUpdatePricingModel,
  selectPricingModelById,
} from '@/db/tableMethods/pricingModelMethods'
import { generateOpenApiMetas, RouteConfig } from '@/utils/openapi'
import { z } from 'zod'
import { clonePricingModelTransaction } from '@/utils/pricingModel'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import { pricingModelWithProductsAndUsageMetersSchema } from '@/db/schema/prices'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { setupPricingModelSchema } from '@/utils/pricingModels/setupSchemas'
import { TRPCError } from '@trpc/server'
import { adminTransaction } from '@/db/adminTransaction'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'pricingModel',
  tags: ['Pricing Models'],
})

export const pricingModelsRouteConfigs = routeConfigs
export const getDefaultPricingModelRouteConfig: Record<
  string,
  RouteConfig
> = {
  'GET /pricing-models/default': {
    procedure: 'pricingModels.getDefault',
    pattern: new RegExp(`^pricing-models\/default$`),
    mapParams: (matches) => ({
      externalId: matches[0],
    }),
  },
}

const listPricingModelsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(pricingModelsPaginatedSelectSchema)
  .output(pricingModelsPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectPricingModelsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getPricingModelProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(
    z.object({
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const [pricingModel] =
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: input.id },
            transaction
          )
        if (!pricingModel) {
          throw new Error(`Pricing Model ${input.id} not found`)
        }
        return { pricingModel }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const createPricingModelProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createPricingModelSchema)
  .output(
    z.object({
      pricingModel: pricingModelsClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction, organizationId, livemode }) => {
        return createPricingModelBookkeeping(
          {
            pricingModel: input.pricingModel,
          },
          { transaction, organizationId, livemode }
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return {
      pricingModel: result.result.pricingModel,
      // Note: We're not returning the default product/price in the API response
      // to maintain backward compatibility, but they are created
    }
  })

const editPricingModelProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editPricingModelSchema)
  .output(
    z.object({
      pricingModel: pricingModelsClientSelectSchema,
    })
  )
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transaction }) => {
        const pricingModel = await safelyUpdatePricingModel(
          {
            ...input.pricingModel,
            id: input.id,
          },
          transaction
        )
        return { result: { pricingModel } }
      }
    )
  )

const getDefaultPricingModelProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/pricing-models/default',
      summary: 'Get Default Pricing Model for Organization',
      tags: ['Pricing Models'],
      protect: true,
    },
  })
  .input(z.object({}))
  .output(
    z.object({
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .query(async ({ ctx }) => {
    const pricingModel = await authenticatedTransaction(
      async ({ transaction }) => {
        const [defaultPricingModel] =
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            {
              organizationId: ctx.organizationId!,
              livemode: ctx.livemode,
              isDefault: true,
            },
            transaction
          )
        if (!defaultPricingModel) {
          throw new Error('Default pricing model not found')
        }
        return defaultPricingModel
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { pricingModel }
  })

const clonePricingModelProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/pricing-models/{id}/clone',
      summary: 'Clone a PricingModel',
      tags: ['PricingModels'],
      protect: true,
    },
  })
  .input(clonePricingModelInputSchema)
  .output(
    z.object({
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const pricingModel = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPricingModelById(input.id, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    if (!pricingModel) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message:
          'The pricing model you are trying to clone either does not exist or you do not have permission to clone it.',
      })
    }
    const clonedPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return await clonePricingModelTransaction(input, transaction)
      }
    )
    return { pricingModel: clonedPricingModel }
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        organizationId: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(
      z.object({
        pricingModel: pricingModelsClientSelectSchema,
        productsCount: z.number(),
      })
    )
  )
  .query(
    authenticatedProcedureTransaction(selectPricingModelsTableRows)
  )

const setupPricingModelProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/pricing-models/setup',
      summary: 'Setup a PricingModel',
      tags: ['PricingModels'],
      protect: true,
    },
  })
  .input(setupPricingModelSchema)
  .output(
    z.object({
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transaction, ctx }) => {
        const result = await setupPricingModelTransaction(
          {
            input,
            organizationId: ctx.organizationId!,
            livemode: ctx.livemode,
          },
          transaction
        )
        const [pricingModelWithProductsAndUsageMeters] =
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: result.pricingModel.id },
            transaction
          )
        return {
          result: {
            pricingModel: pricingModelWithProductsAndUsageMeters,
          },
        }
      }
    )
  )

export const pricingModelsRouter = router({
  list: listPricingModelsProcedure,
  setup: setupPricingModelProcedure,
  get: getPricingModelProcedure,
  getDefault: getDefaultPricingModelProcedure,
  create: createPricingModelProcedure,
  update: editPricingModelProcedure,
  clone: clonePricingModelProcedure,
  getTableRows: getTableRowsProcedure,
})
