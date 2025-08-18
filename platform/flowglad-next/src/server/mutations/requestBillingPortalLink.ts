import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { requestBillingPortalLinkSchema } from '@/db/schema/customers'
import { hostedBillingStackServerApp } from '@/stack'

export const requestBillingPortalLink = publicProcedure
  .input(requestBillingPortalLinkSchema)
  .mutation(async ({ input }) => {
    await adminTransaction(async ({ transaction }) => {
      const customers = await selectCustomers(
        {
          id: input.customerId,
          organizationId: input.organizationId,
          email: input.email,
        },
        transaction
      )

      if (customers.length > 0) {
        await hostedBillingStackServerApp.sendMagicLinkEmail(
          input.email
        )
      }
    })

    return { success: true }
  })
