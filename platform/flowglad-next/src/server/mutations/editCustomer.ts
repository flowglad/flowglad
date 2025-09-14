import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  editCustomerInputSchema,
  editCustomerOutputSchema,
} from '@/db/schema/customers'
import {
  selectCustomerByExternalIdAndOrganizationId,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { TRPCError } from '@trpc/server'

export const editCustomer = protectedProcedure
  .input(editCustomerInputSchema)
  .output(editCustomerOutputSchema)
  .mutation(async ({ input }) => {
    return authenticatedTransaction(
      async ({ transaction, organizationId }) => {
        const { customer } = input
        const customerRecord =
          await selectCustomerByExternalIdAndOrganizationId(
            {
              externalId: input.externalId,
              organizationId: organizationId,
            },
            transaction
          )
        if (!customerRecord) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Customer with externalId ${input.externalId} not found`,
          })
        }
        const updatedCustomer = await updateCustomer(
          {
            ...customer,
            id: customerRecord.id,
          },
          transaction
        )
        return {
          customer: updatedCustomer,
        }
      }
    )
  })
