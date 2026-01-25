import { z } from 'zod'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import {
  createWebhookInputSchema,
  editWebhookInputSchema,
  webhookClientSelectSchema,
  webhooksTableRowDataSchema,
} from '@/db/schema/webhooks'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import {
  insertWebhook,
  selectWebhookAndOrganizationByWebhookId,
  selectWebhookById,
  selectWebhooksTableRowData,
  updateWebhook as updateWebhookDB,
} from '@/db/tableMethods/webhookMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'
import { generateOpenApiMetas } from '@/utils/openapi'
import {
  createSvixEndpoint,
  findOrCreateSvixApplication,
  getSvixSigningSecret,
  updateSvixEndpoint,
} from '@/utils/svix'
import { router } from '../trpc'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'webhook',
  tags: ['Webhooks'],
})

export const webhooksRouteConfigs = routeConfigs

export const createWebhook = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createWebhookInputSchema)
  .output(
    z.object({
      webhook: webhookClientSelectSchema,
      secret: z.string(),
    })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { livemode } = ctx
        const organization = ctx.organization
        if (!organization) {
          throw new Error('Organization not found')
        }

        // Validate pricingModelId belongs to org and livemode
        const pricingModel = await selectPricingModelById(
          input.pricingModelId,
          transaction
        )
        if (
          pricingModel.organizationId !== organization.id ||
          pricingModel.livemode !== livemode
        ) {
          throw new Error(
            'Invalid pricing model for this organization and mode'
          )
        }

        // Create PM-scoped Svix app (lazy creation)
        await findOrCreateSvixApplication({
          organization,
          livemode,
          pricingModelId: input.pricingModelId,
        })

        const webhook = await insertWebhook(
          {
            ...input.webhook,
            organizationId: organization.id,
            livemode,
            pricingModelId: input.pricingModelId,
          },
          transaction
        )
        await createSvixEndpoint({
          webhook,
          organization,
        })
        const secret = await getSvixSigningSecret({
          webhook,
          organization,
        })
        return { webhook, secret: secret.key }
      }
    )
  )

export const updateWebhook = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editWebhookInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const webhook = await updateWebhookDB(
          {
            ...input.webhook,
            id: input.id,
          },
          transaction
        )
        const organization = await selectOrganizationById(
          webhook.organizationId,
          transaction
        )
        await updateSvixEndpoint({
          webhook,
          organization,
        })
        return { webhook }
      }
    )
  )

export const getWebhook = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const webhook = await selectWebhookById(input.id, transaction)
        return { webhook }
      }
    )
  )

export const requestWebhookSigningSecret = protectedProcedure
  .input(z.object({ webhookId: z.string() }))
  .output(z.object({ secret: z.string() }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { webhook, organization } =
          await selectWebhookAndOrganizationByWebhookId(
            input.webhookId,
            transaction
          )
        const secret = await getSvixSigningSecret({
          webhook,
          organization,
        })
        return { secret: secret.key }
      }
    )
  )

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        active: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(webhooksTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectWebhooksTableRowData({ input, transaction })
      }
    )
  )

export const webhooksRouter = router({
  get: getWebhook,
  create: createWebhook,
  update: updateWebhook,
  requestSigningSecret: requestWebhookSigningSecret,
  getTableRows,
})
