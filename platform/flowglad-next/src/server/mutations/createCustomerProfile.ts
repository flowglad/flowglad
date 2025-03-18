import * as R from 'ramda'
import { protectedProcedure } from '../trpc'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import { createOrUpdateCustomerProfile as createCustomerProfileBookkeeping } from '@/utils/bookkeeping'
import { revalidatePath } from 'next/cache'
import { createCustomerProfileInputSchema } from '@/db/tableMethods/purchaseMethods'
import { createCustomerProfileOutputSchema } from '@/db/schema/purchases'

export const createCustomerProfile = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/customer-profiles',
      summary: 'Create a customer profile',
      tags: ['Customer'],
      protect: true,
    },
  })
  .input(createCustomerProfileInputSchema)
  .output(createCustomerProfileOutputSchema)
  .mutation(async ({ input, ctx }) => {
    // if (1 > 0) {
    //   throw new TRPCError({
    //     code: 'BAD_REQUEST',
    //     message: 'test error!',
    //   })
    // }
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new Error('organizationId is required')
    }
    return authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { customerProfile } = input
        /**
         * We have to parse the customer record here because of the billingAddress json
         */
        const createdCustomer =
          await createCustomerProfileBookkeeping(
            {
              customerProfile: {
                ...customerProfile,
                organizationId: organizationId,
                livemode,
              },
            },
            { transaction, userId, livemode }
          )

        if (ctx.path) {
          await revalidatePath(ctx.path)
        }

        return {
          data: {
            customerProfile: createdCustomer.customerProfile,
          },
        }
      },
      {
        apiKey: R.propOr(undefined, 'apiKey', ctx),
      }
    )
  })
