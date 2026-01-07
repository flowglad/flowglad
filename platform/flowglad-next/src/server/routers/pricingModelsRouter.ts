import { TRPCError } from '@trpc/server'
import yaml from 'json-to-pretty-yaml'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { pricingModelWithProductsAndUsageMetersSchema } from '@/db/schema/prices'
import {
  clonePricingModelInputSchema,
  createPricingModelSchema,
  editPricingModelSchema,
  pricingModelsClientSelectSchema,
  pricingModelsPaginatedListSchema,
  pricingModelsPaginatedSelectSchema,
} from '@/db/schema/pricingModels'
import {
  safelyUpdatePricingModel,
  selectPricingModelById,
  selectPricingModelsPaginated,
  selectPricingModelsTableRows,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from '@/db/tableMethods/pricingModelMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { protectedProcedure, router } from '@/server/trpc'
import { DestinationEnvironment } from '@/types'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import {
  generateOpenApiMetas,
  type RouteConfig,
} from '@/utils/openapi'
import { clonePricingModelTransaction } from '@/utils/pricingModel'
import {
  constructIntegrationGuide,
  constructIntegrationGuideStream,
} from '@/utils/pricingModels/integration-guides/constructIntegrationGuide'
import { getPricingModelSetupData } from '@/utils/pricingModels/setupHelpers'
import { setupPricingModelSchema } from '@/utils/pricingModels/setupSchemas'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'
import { getOrganizationCodebaseMarkdown } from '@/utils/textContent'

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
    pattern: /^pricing-models\/default$/,
    mapParams: (matches) => ({
      externalId: matches[0],
    }),
  },
}

export const setupPricingModelRouteConfig: Record<
  string,
  RouteConfig
> = {
  'POST /pricing-models/setup': {
    procedure: 'pricingModels.setup',
    pattern: /^pricing-models\/setup$/,
    mapParams: (matches, body) => body,
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
            defaultPlanIntervalUnit: input.defaultPlanIntervalUnit,
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

const updatePricingModelProcedure = protectedProcedure
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
      tags: ['Pricing Models'],
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
    const clonedPricingModel = await authenticatedTransaction(
      async ({ transaction, livemode }) => {
        const pricingModel = await selectPricingModelById(
          input.id,
          transaction
        )
        if (!pricingModel) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message:
              'The pricing model you are trying to clone either does not exist or you do not have permission to clone it.',
          })
        }

        const destinationLivemode = input.destinationEnvironment
          ? input.destinationEnvironment ===
            DestinationEnvironment.Livemode
          : pricingModel.livemode

        if (destinationLivemode !== livemode) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Cannot clone to a different environment than your API key. Use a live-mode API key to clone to live mode, or a test-mode API key to clone to test mode.',
          })
        }

        return clonePricingModelTransaction(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
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
      tags: ['Pricing Models'],
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

const exportPricingModelProcedure = protectedProcedure
  .input(idInputSchema)
  .output(
    z.object({
      pricingModelYAML: z
        .string()
        .describe('YAML representation of the pricing model'),
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const data = await getPricingModelSetupData(
          input.id,
          transaction
        )
        return { pricingModelYAML: yaml.stringify(data) }
      }
    )
  )

const getIntegrationGuideProcedure = protectedProcedure
  .input(idInputSchema)
  .query(async function* ({ input, ctx }) {
    // Fetch data within a transaction first
    const { pricingModelData, codebaseContext } =
      await authenticatedTransaction(
        async ({ transaction }) => {
          const pricingModelData = await getPricingModelSetupData(
            input.id,
            transaction
          )
          const codebaseContext =
            await getOrganizationCodebaseMarkdown(ctx.organizationId!)
          return { pricingModelData, codebaseContext }
        },
        {
          apiKey: ctx.apiKey,
        }
      )

    // Then stream the AI-generated content (doesn't need transaction)
    yield* constructIntegrationGuideStream({
      pricingModelData,
      isBackendJavascript: true,
      codebaseContext: codebaseContext ?? undefined,
    })
  })

export const pricingModelsRouter = router({
  list: listPricingModelsProcedure,
  setup: setupPricingModelProcedure,
  get: getPricingModelProcedure,
  getDefault: getDefaultPricingModelProcedure,
  create: createPricingModelProcedure,
  update: updatePricingModelProcedure,
  clone: clonePricingModelProcedure,
  getTableRows: getTableRowsProcedure,
  export: exportPricingModelProcedure,
  getIntegrationGuide: {
    streaming: getIntegrationGuideProcedure,
  },
})
