import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
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
  .mutation(async ({ input, ctx }) => {
    const organization = ctx.organization
    if (!organization) {
      throw new Error('Organization not found')
    }
    const { livemode } = ctx
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await createWebhookTransaction({
          webhook: input.webhook,
          organization,
          livemode,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const updateWebhook = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editWebhookInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const webhook = await updateWebhookDB(
          {
            ...input.webhook,
            id: input.id,
          },
          transaction
        )
        const organization = (
          await selectOrganizationById(
            webhook.organizationId,
            transaction
          )
        ).unwrap()
        await updateSvixEndpoint({
          webhook,
          organization,
        })
        return Result.ok({ webhook })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const getWebhook = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const webhook = (
          await selectWebhookById(input.id, transaction)
        ).unwrap()
        return Result.ok({ webhook })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const requestWebhookSigningSecret = protectedProcedure
  .input(z.object({ webhookId: z.string() }))
  .output(z.object({ secret: z.string() }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const { webhook, organization } =
          await selectWebhookAndOrganizationByWebhookId(
            input.webhookId,
            transaction
          )
        const secret = await getSvixSigningSecret({
          webhook,
          organization,
        })
        return Result.ok({ secret: secret.key })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectWebhooksTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const webhooksRouter = router({
  get: getWebhook,
  create: createWebhook,
  update: updateWebhook,
  requestSigningSecret: requestWebhookSigningSecret,
  getTableRows,
})
