import { z } from 'zod'
import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { stackServerApp } from '@/stack'

const requestBillingPortalLinkSchema = z.object({
  customerId: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
})

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
        await stackServerApp.sendMagicLinkEmail(input.email)
      }
    })

    return { success: true }
  })
