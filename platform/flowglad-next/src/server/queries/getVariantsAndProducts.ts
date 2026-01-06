import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { protectedProcedure } from '../trpc'

export const getPricesAndProducts = protectedProcedure.query(
  async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )
        return selectPricesAndProductsForOrganization(
          {
            active: true,
          },
          organization.id,
          transaction
        )
      },
      { operationName: 'getPricesAndProducts' }
    )
  }
)
