import { router } from '../trpc'
import {
  editWebhookInputSchema,
  webhooksTableRowDataSchema,
} from '@/db/schema/webhooks'
import {
  selectWebhookById,
  insertWebhook,
  updateWebhook,
  selectWebhookAndOrganizationByWebhookId,
  selectWebhooksTableRowData,
} from '@/db/tableMethods/webhookMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import {
  webhookClientSelectSchema,
  createWebhookInputSchema,
} from '@/db/schema/webhooks'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { z } from 'zod'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  createSvixEndpoint,
  getSvixSigningSecret,
  updateSvixEndpoint,
} from '@/utils/svix'

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
      async ({ input, transaction, ctx, livemode }) => {
        const organization = ctx.organization
        if (!organization) {
          throw new Error('Organization not found')
        }
        const webhook = await insertWebhook(
          {
            ...input.webhook,
            organizationId: organization.id,
            livemode,
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

export const editWebhook = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editWebhookInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, ctx }) => {
        const webhook = await updateWebhook(
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
      async ({ input, transaction }) => {
        const webhook = await selectWebhookById(input.id, transaction)
        return { webhook }
      }
    )
  )

export const requestWebhookSigningSecret = protectedProcedure
  .input(z.object({ webhookId: z.string() }))
  .output(z.object({ secret: z.string() }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
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
    authenticatedProcedureTransaction(selectWebhooksTableRowData)
  )

export const webhooksRouter = router({
  get: getWebhook,
  create: createWebhook,
  update: editWebhook,
  requestSigningSecret: requestWebhookSigningSecret,
  getTableRows,
})
