import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { z } from 'zod'
import { selectCustomerProfiles } from '@/db/tableMethods/customerProfileMethods'
import { customerProfileClientSelectSchema } from '@/db/schema/customerProfiles'
import { TRPCError } from '@trpc/server'

export const getCustomerProfile = protectedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/customer-profiles/{externalId}',
      summary: 'Get a customer profile',
      tags: ['Customer', 'Customer Profiles'],
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
      customerProfile: customerProfileClientSelectSchema,
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

    const customerProfiles = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectCustomerProfiles(
          { ...input, organizationId },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    if (!customerProfiles.length) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Customer profile with externalId ${input.externalId} not found`,
      })
    }

    return {
      customerProfile: customerProfiles[0],
    }
  })
