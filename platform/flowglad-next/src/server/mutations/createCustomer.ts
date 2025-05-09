import * as R from 'ramda'
import { protectedProcedure } from '../trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { revalidatePath } from 'next/cache'
import { createCustomerInputSchema } from '@/db/tableMethods/purchaseMethods'
import { createCustomerOutputSchema } from '@/db/schema/purchases'

export const createCustomer = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/customers',
      summary: 'Create a customer',
      tags: ['Customer'],
      protect: true,
    },
  })
  .input(createCustomerInputSchema)
  .output(createCustomerOutputSchema)
  .mutation(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new Error('organizationId is required')
    }
    return authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { customer } = input
        /**
         * We have to parse the customer record here because of the billingAddress json
         */
        const createdCustomer = await createCustomerBookkeeping(
          {
            customer: {
              ...customer,
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
            customer: createdCustomer.customer,
          },
        }
      },
      {
        apiKey: R.propOr(undefined, 'apiKey', ctx),
      }
    )
  })
