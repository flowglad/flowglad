import { router } from '../trpc'
import { editWebhookInputSchema } from '@/db/schema/webhooks'
import {
  selectWebhookById,
  insertWebhook,
  updateWebhook,
} from '@/db/tableMethods/webhookMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import {
  webhookClientSelectSchema,
  createWebhookInputSchema,
} from '@/db/schema/webhooks'

import { protectedProcedure } from '@/server/trpc'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'webhook',
  tags: ['Webhooks'],
})

export const webhooksRouteConfigs = routeConfigs

export const createWebhook = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createWebhookInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, userId, livemode }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )
        const webhook = await insertWebhook(
          {
            ...input.webhook,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
        return { webhook }
      }
    )
  )

export const editWebhook = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editWebhookInputSchema)
  .output(z.object({ webhook: webhookClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const webhook = await updateWebhook(
          {
            ...input.webhook,
            id: input.id,
          },
          transaction
        )
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

export const webhooksRouter = router({
  get: getWebhook,
  create: createWebhook,
  update: editWebhook,
})
