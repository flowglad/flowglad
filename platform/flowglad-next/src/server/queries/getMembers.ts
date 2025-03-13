import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'

export const getMembers = protectedProcedure.query(
  async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('OrganizationId is required')
    }

    const members = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectMembershipsAndUsersByMembershipWhere(
          { OrganizationId: ctx.organizationId },
          transaction
        )
      }
    )

    return {
      data: { members },
    }
  }
)
