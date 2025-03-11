import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'

export const getMembers = protectedProcedure.query(
  async ({ ctx }) => {
    if (!ctx.OrganizationId) {
      throw new Error('OrganizationId is required')
    }

    const members = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectMembershipsAndUsersByMembershipWhere(
          { OrganizationId: ctx.OrganizationId },
          transaction
        )
      }
    )

    return {
      data: { members },
    }
  }
)
