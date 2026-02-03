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
import { updatePricingModelTransaction } from '@/utils/pricingModels/updateTransaction'
import { unwrapOrThrow } from '@/utils/resultHelpers'
import { getOrganizationCodebaseMarkdown } from '@/utils/textContent'

/**
 * Extended edit schema for full pricing model structure updates.
 * Adds optional structure fields (features, products, usageMeters, resources)
 * to enable CLI sync workflows where the entire pricing model structure is updated.
 *
 * When structure fields are provided, the update procedure uses the full
 * diffing and update transaction logic. When only metadata fields are provided,
 * it uses the simple update path for backward compatibility.
 */
const extendedEditPricingModelSchema = z.object({
  id: z.string(),
  pricingModel: z
    .object({
      name: z.string().min(1, 'Name is required'),
      isDefault: z.boolean().optional(),
      // Optional full structure fields for CLI sync
      features: setupPricingModelSchema.shape.features.optional(),
      products: setupPricingModelSchema.shape.products.optional(),
      usageMeters:
        setupPricingModelSchema.shape.usageMeters.optional(),
      resources: setupPricingModelSchema.shape.resources.optional(),
    })
    .passthrough(), // Allow other fields from the base update schema
})

export type ExtendedEditPricingModelInput = z.infer<
  typeof extendedEditPricingModelSchema
>

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
    return unwrapOrThrow(
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
    return unwrapOrThrow(
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
    )
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
          const bookkeepingResult =
            await createPricingModelBookkeeping(
              {
                pricingModel: input.pricingModel,
                defaultPlanIntervalUnit:
                  input.defaultPlanIntervalUnit,
              },
              {
                ...transactionCtx,
                organizationId,
                livemode: false,
              }
            )
          return Result.ok(bookkeepingResult.unwrap())
        },
        { livemode: false }
      )
    ).unwrap()
    return { pricingModel: result.pricingModel }
  })

/**
 * Update a pricing model.
 *
 * This procedure supports two modes:
 * 1. **Metadata-only update** (existing behavior): When only `name` and/or `isDefault`
 *    are provided, the procedure uses the simple update path.
 * 2. **Full structure update** (CLI sync workflow): When `features`, `products`,
 *    `usageMeters`, or `resources` fields are provided, the procedure uses the
 *    full diff and update transaction to atomically update the entire pricing model.
 *    This is a FULL REPLACEMENT - all structure fields must be provided to prevent
 *    accidental data loss. The CLI always sends the complete structure.
 *
 * Uses adminTransaction for full structure updates to bypass RLS policies, as the
 * update may need to create/update/deactivate resources across pricing model scope.
 * Authorization is enforced via a pre-check using authenticatedTransaction.
 */
const updatePricingModelProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(extendedEditPricingModelSchema)
  .output(
    z.object({
      pricingModel: pricingModelsClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { pricingModel: pricingModelInput } = input
    const pricingModelId = input.id

    // Check if structure fields are provided
    const hasStructureFields =
      pricingModelInput.features !== undefined ||
      pricingModelInput.products !== undefined ||
      pricingModelInput.usageMeters !== undefined ||
      pricingModelInput.resources !== undefined

    // If no structure fields provided, use simple metadata update (existing behavior)
    if (!hasStructureFields) {
      return unwrapOrThrow(
        await authenticatedTransaction(
          async (transactionCtx) => {
            const pricingModel = await safelyUpdatePricingModel(
              {
                name: pricingModelInput.name,
                isDefault: pricingModelInput.isDefault,
                id: pricingModelId,
              },
              transactionCtx
            )
            return Result.ok({ pricingModel })
          },
          {
            apiKey: ctx.apiKey,
          }
        )
      )
    }

    // Full structure update requires ALL structure fields to prevent accidental data loss.
    // This enforces PUT (full replacement) semantics rather than PATCH (partial update).
    if (
      pricingModelInput.features === undefined ||
      pricingModelInput.products === undefined ||
      pricingModelInput.usageMeters === undefined
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Full structure update requires all structure fields (features, products, usageMeters) to be provided. ' +
          'For metadata-only updates, omit all structure fields.',
      })
    }

    // Authorization pre-check: verify the user can access this pricing model via RLS
    // before proceeding with the admin-level update
    unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction }) => {
          const pricingModelResult = await selectPricingModelById(
            pricingModelId,
            transaction
          )
          if (Result.isError(pricingModelResult)) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message:
                'The pricing model you are trying to update either does not exist or you do not have permission to update it.',
            })
          }
          return Result.ok(undefined)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    )

    // Full structure update: use diff + update transaction
    // Uses adminTransaction to bypass RLS policies for cross-resource updates
    const result = await adminTransaction(async (transactionCtx) => {
      // Build the proposed input from the request
      // All structure fields are guaranteed to be defined by the validation above
      // Using non-null assertions since TypeScript doesn't narrow across the throw
      const proposedInput = {
        name: pricingModelInput.name,
        isDefault: pricingModelInput.isDefault ?? false,
        features: pricingModelInput.features!,
        products: pricingModelInput.products!,
        usageMeters: pricingModelInput.usageMeters!,
        resources: pricingModelInput.resources,
      }

      const updateResult = await updatePricingModelTransaction(
        {
          pricingModelId,
          proposedInput,
        },
        transactionCtx
      )

      if (Result.isError(updateResult)) {
        return updateResult
      }

      return Result.ok({
        pricingModel: updateResult.value.pricingModel,
      })
    })

    return unwrapOrThrow(result)
  })

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
    const pricingModel = unwrapOrThrow(
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
    // This transaction is just for authorization - it verifies the user can access
    // the source pricing model. We don't need the value, just confirmation it exists.
    unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction }) => {
          const pricingModelResult = await selectPricingModelById(
            input.id,
            transaction
          )
          if (Result.isError(pricingModelResult)) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message:
                'The pricing model you are trying to clone either does not exist or you do not have permission to clone it.',
            })
          }
          return Result.ok(undefined)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    )

    // The authorization check above ensures the user can access the pricing model.

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
    const { pricingModelData, codebaseContext } = unwrapOrThrow(
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
  getAllForSwitcher: getAllForSwitcherProcedure,
  export: exportPricingModelProcedure,
  getIntegrationGuide: {
    streaming: getIntegrationGuideProcedure,
  },
})
