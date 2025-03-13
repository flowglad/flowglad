import * as R from 'ramda'
import { protectedProcedure } from '../trpc'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import { createOrUpdateCustomerProfile as createCustomerProfileBookkeeping } from '@/utils/bookkeeping'
import { revalidatePath } from 'next/cache'
import {
  selectCustomers,
  upsertCustomerByEmail,
} from '@/db/tableMethods/customerMethods'
import { createCustomerProfileInputSchema } from '@/db/tableMethods/purchaseMethods'
import { createCustomerProfileOutputSchema } from '@/db/schema/purchases'
import { TRPCError } from '@trpc/server'

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
    /**
     * We can't allow an insert on to customers without
     * allowing full table read, it seems.
     * So we insert a customer record and then do the rest of the
     * stuff atomically. Not ideal, but it works.
     */
    const customerRecord = await adminTransaction(
      async ({ transaction }) => {
        const upsertResult = await upsertCustomerByEmail(
          {
            email: input.customerProfile.email,
            name: input.customerProfile.name ?? '',
            billingAddress: null,
            livemode: ctx.livemode,
          },
          transaction
        )
        if (upsertResult.length > 0) {
          return upsertResult[0]
        }
        const customerResult = await selectCustomers(
          {
            email: input.customerProfile.email,
          },
          transaction
        )
        return customerResult[0]
      }
    )
    return authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { customerProfile } = input
        /**
         * We have to parse the customer record here because of the billingAddress json
         */
        const createdCustomer =
          await createCustomerProfileBookkeeping(
            {
              customer: customerRecord,
              customerProfile: {
                ...customerProfile,
                organizationId: organizationId,
                customerId: customerRecord.id,
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
