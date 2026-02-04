import { Result } from 'better-result'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { protectedProcedure } from '../trpc'

export const getPricesAndProducts = protectedProcedure.query(
  async ({ input, ctx }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction, userId }) => {
          const [{ organization }] =
            await selectMembershipAndOrganizations(
              {
                userId,
                focused: true,
              },
              transaction
            )
          return Result.ok(
            await selectPricesAndProductsForOrganization(
              {
                active: true,
              },
              organization.id,
              transaction
            )
          )
        }
      )
    ).unwrap()
  }
)
