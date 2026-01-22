import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import yaml from 'json-to-pretty-yaml'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
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
  NotFoundError,
} from '@/db/tableUtils'
import { protectedProcedure, router } from '@/server/trpc'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import {
  generateOpenApiMetas,
  type RouteConfig,
  trpcToRest,
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

export const pricingModelsRouteConfigs = [
  ...routeConfigs,
  trpcToRest('pricingModels.clone'),
]
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
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { livemode, organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const result = await createPricingModelBookkeeping(
          {
            pricingModel: input.pricingModel,
            defaultPlanIntervalUnit: input.defaultPlanIntervalUnit,
          },
          {
            ...transactionCtx,
            organizationId,
            livemode,
          }
        )
        return Result.ok({
          pricingModel: result.unwrap().pricingModel,
          // Note: We're not returning the default product/price in the API response
          // to maintain backward compatibility, but they are created
        })
      }
    )
  )

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
      async ({ input, transactionCtx }) => {
        const pricingModel = await safelyUpdatePricingModel(
          {
            ...input.pricingModel,
            id: input.id,
          },
          transactionCtx
        )
        return Result.ok({ pricingModel })
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
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }
    const organizationId = ctx.organizationId
    const pricingModel = await authenticatedTransaction(
      async ({ transaction }) => {
        const [defaultPricingModel] =
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            {
              organizationId,
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
    const pricingModel = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPricingModelById(input.id, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    ).catch((error) => {
      if (error instanceof NotFoundError) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message:
            'The pricing model you are trying to clone either does not exist or you do not have permission to clone it.',
        })
      }
      throw error
    })

    /**
     * We intentionally use adminTransaction here to allow cloning pricing models
     * across environments (test mode to live mode and vice versa). This is a
     * supported UI feature that lets users promote their pricing model configuration
     * from test to production.
     *
     * Security note: Any authenticated API key (test or live) can clone to either
     * environment via the destinationEnvironment parameter. The authenticatedTransaction
     * above ensures the caller has read access to the source pricing model. This is
     * acceptable because:
     * 1. Pricing models contain configuration data, not sensitive customer information
     * 2. Only authenticated users within the organization can access this endpoint
     * 3. The feature enables legitimate workflows like promoting test configs to production
     *
     * If stricter controls are needed in the future, consider either:
     * - Removing destinationEnvironment from the public API schema (clonePricingModelInputSchema)
     * - Adding role/scope checks before allowing cross-environment clones
     */
    const clonedPricingModel = await adminTransaction(
      async (transactionCtx) => {
        return await clonePricingModelTransaction(
          input,
          transactionCtx
        )
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
        livemode: z.boolean().optional(),
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
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectPricingModelsTableRows({ input, transaction })
      }
    )
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
      async ({ input, ctx, transactionCtx }) => {
        if (!ctx.organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const { transaction } = transactionCtx
        const result = await setupPricingModelTransaction(
          {
            input,
            organizationId: ctx.organizationId,
            livemode: ctx.livemode,
          },
          transactionCtx
        )
        const setupResult = result.unwrap()
        const [pricingModelWithProductsAndUsageMeters] =
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: setupResult.pricingModel.id },
            transaction
          )
        return Result.ok({
          pricingModel: pricingModelWithProductsAndUsageMeters,
        })
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const data = await getPricingModelSetupData(
          input.id,
          transaction
        )
        return { pricingModelYAML: yaml.stringify(data.unwrap()) }
      }
    )
  )

const getIntegrationGuideProcedure = protectedProcedure
  .input(idInputSchema)
  .query(async function* ({ input, ctx }) {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }
    const organizationId = ctx.organizationId
    // Fetch data within a transaction first
    const { pricingModelData, codebaseContext } =
      await authenticatedTransaction(
        async ({ transaction }) => {
          const pricingModelData = await getPricingModelSetupData(
            input.id,
            transaction
          )
          const codebaseContext =
            await getOrganizationCodebaseMarkdown(organizationId)
          return { pricingModelData, codebaseContext }
        },
        {
          apiKey: ctx.apiKey,
        }
      )

    // Then stream the AI-generated content (doesn't need transaction)
    yield* constructIntegrationGuideStream({
      pricingModelData: pricingModelData.unwrap(),
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
