import { z } from 'zod'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import {
  createWebhookInputSchema,
  editWebhookInputSchema,
  webhookClientSelectSchema,
  webhooksTableRowDataSchema,
} from '@/db/schema/webhooks'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
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
  getSvixSigningSecret,
  updateSvixEndpoint,
} from '@/utils/svix'
import { createWebhookTransaction } from '@/utils/webhooks'
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

        return createWebhookTransaction({
          webhook: input.webhook,
          organization,
          livemode,
          transaction,
        })
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
