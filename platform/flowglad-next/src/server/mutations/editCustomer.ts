import {
  editCustomerInputSchema,
  editCustomerOutputSchema,
} from '@db-core/schema/customers'
import { TRPCError } from '@trpc/server'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectCustomerByExternalIdAndOrganizationId,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { protectedProcedure } from '@/server/trpc'

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
