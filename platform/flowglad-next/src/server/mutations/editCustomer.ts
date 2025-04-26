import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  editCustomerInputSchema,
  editCustomerOutputSchema,
} from '@/db/schema/customers'
import { updateCustomer } from '@/db/tableMethods/customerMethods'

export const editCustomer = protectedProcedure
  .input(editCustomerInputSchema)
  .output(editCustomerOutputSchema)
  .mutation(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const { customer } = input

      const updatedCustomer = await updateCustomer(
        customer,
        transaction
      )
      return {
        customer: updatedCustomer,
      }
    })
  })
