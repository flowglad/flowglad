import { protectedProcedure } from '../trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectVariantsAndProductsForOrganization } from '@/db/tableMethods/variantMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'

export const getVariantsAndProducts = protectedProcedure.query(
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
        return selectVariantsAndProductsForOrganization(
          {
            active: true,
          },
          organization.id,
          transaction
        )
      }
    )
  }
)
