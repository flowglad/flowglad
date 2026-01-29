import { customerClientSelectSchema } from '@db-core/schema/customers'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { protectedProcedure } from '@/server/trpc'

export const getCustomer = protectedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/customers/{externalId}',
      summary: 'Get a customer',
      tags: ['Customer'],
      protect: true,
    },
  })
  .input(
    z.object({
      externalId: z
        .string()
        .describe(
          'The ID of the customer, as defined in your application'
        ),
    })
  )
  .output(
    z.object({
      customer: customerClientSelectSchema,
    })
  )
  .query(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }

    const customers = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          { ...input, organizationId },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    if (!customers.length) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Customer with externalId ${input.externalId} not found`,
      })
    }

    return {
      customer: customers[0],
    }
  })
