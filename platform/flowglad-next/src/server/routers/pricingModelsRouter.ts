import { pricingModelWithProductsAndUsageMetersSchema } from '@db-core/schema/prices'
import {
  clonePricingModelInputSchema,
  createPricingModelSchema,
  editPricingModelSchema,
  pricingModelsClientSelectSchema,
  pricingModelsPaginatedListSchema,
  pricingModelsPaginatedSelectSchema,
} from '@db-core/schema/pricingModels'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
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
import {
  safelyUpdatePricingModel,
  selectPricingModelById,
  selectPricingModelsPaginated,
  selectPricingModelsTableRows,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from '@/db/tableMethods/pricingModelMethods'
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
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectPricingModelsPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
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
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const [pricingModel] =
            await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
              { id: input.id },
              transaction
            )
          if (!pricingModel) {
            throw new Error(`Pricing Model ${input.id} not found`)
          }
          return Result.ok({ pricingModel })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

/**
 * Create a new pricing model.
 *
 * Note: New pricing models are always created in testmode (livemode: false).
 * This is because only one livemode pricing model is allowed per organization
 * (enforced by a database constraint).
 *
 * Uses adminTransaction to bypass the livemode RLS policy on pricing_models,
 * since users in livemode context need to create testmode pricing models.
 * Also bypasses pricing model scope RLS on products table for creating the
 * default product.
 */
const createPricingModelProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createPricingModelSchema)
  .output(
    z.object({
      pricingModel: pricingModelsClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { organizationId } = ctx
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }
    // Always create in testmode - only one livemode pricing model is allowed
    // per organization. Uses adminTransaction to bypass livemode RLS.
    const result = (
      await adminTransaction(
        async (transactionCtx) => {
          return createPricingModelBookkeeping(
            {
              pricingModel: input.pricingModel,
              defaultPlanIntervalUnit: input.defaultPlanIntervalUnit,
            },
            {
              ...transactionCtx,
              organizationId,
              livemode: false,
            }
          )
        },
        { livemode: false }
      )
    ).unwrap()
    return { pricingModel: result.pricingModel }
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
    const pricingModel = (
      await authenticatedTransaction(
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
          return Result.ok(defaultPricingModel)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
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
    const pricingModelResult = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectPricingModelById(input.id, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()

    if (Result.isError(pricingModelResult)) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message:
          'The pricing model you are trying to clone either does not exist or you do not have permission to clone it.',
      })
    }

    // pricingModelResult.value contains the pricing model but we don't need it -
    // the authorization check above ensures the user can access it.

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
    const clonedPricingModel = (
      await adminTransaction(async (transactionCtx) => {
        return Result.ok(
          await clonePricingModelTransaction(input, transactionCtx)
        )
      })
    ).unwrap()

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

/**
 * Get all pricing models for the organization across both livemode and test mode.
 * Used by the pricing model switcher UI which needs to display all pricing models
 * regardless of the current livemode context.
 *
 * Uses adminTransaction to bypass the livemode RLS policy on pricing_models table,
 * but explicitly scopes to the user's organization for security.
 */
const getAllForSwitcherProcedure = protectedProcedure
  .output(
    createPaginatedTableRowOutputSchema(
      z.object({
        pricingModel: pricingModelsClientSelectSchema,
        productsCount: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }

    // Use adminTransaction to bypass RLS livemode check,
    // but explicitly scope to the user's organization for security
    return (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectPricingModelsTableRows({
            input: {
              pageSize: 100,
              filters: {
                organizationId: ctx.organizationId,
              },
            },
            transaction,
          })
        )
      })
    ).unwrap()
  })

/**
 * Setup a pricing model from a template.
 *
 * Note: Like createPricingModelProcedure, new pricing models are always created
 * in testmode (livemode: false) because only one livemode pricing model is
 * allowed per organization.
 *
 * Uses adminTransaction to bypass RLS policies that would otherwise prevent
 * creating resources (usage meters, products, features, prices) for the new
 * pricing model when the user's focused pricing model is different.
 */
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
  .mutation(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for this operation.',
      })
    }
    // Always create in testmode - only one livemode pricing model is allowed
    // per organization. Uses adminTransaction to bypass livemode and pricing
    // model scope RLS policies.
    const pricingModelWithProductsAndUsageMeters = (
      await adminTransaction(
        async (transactionCtx) => {
          const { transaction } = transactionCtx
          const result = await setupPricingModelTransaction(
            {
              input,
              organizationId: ctx.organizationId!,
              livemode: false, // Force testmode for new PMs
            },
            transactionCtx
          )
          const setupResult = result.unwrap()
          const [pricingModel] =
            await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
              { id: setupResult.pricingModel.id },
              transaction
            )
          return Result.ok(pricingModel)
        },
        { livemode: false }
      )
    ).unwrap()
    return { pricingModel: pricingModelWithProductsAndUsageMeters }
  })

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
        return {
          pricingModelYAML: yaml.stringify(data.unwrap()),
        }
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
    const { pricingModelData, codebaseContext } = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const pricingModelData = await getPricingModelSetupData(
            input.id,
            transaction
          )
          const codebaseContext =
            await getOrganizationCodebaseMarkdown(organizationId)
          return Result.ok({ pricingModelData, codebaseContext })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()

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
  getAllForSwitcher: getAllForSwitcherProcedure,
  export: exportPricingModelProcedure,
  getIntegrationGuide: {
    streaming: getIntegrationGuideProcedure,
  },
})
