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
    return authenticatedTransaction(
      async ({ transaction, userId, livemode, organizationId }) => {
        const { customer } = input
        /**
         * We have to parse the customer record here because of the billingAddress json
         */
        const createdCustomer = await createCustomerBookkeeping(
          {
            customer: {
              ...customer,
              organizationId,
              livemode,
            },
          },
          { transaction, userId, livemode, organizationId }
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
