import { protectedProcedure } from '@/server/trpc'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import {
  selectFocusedMembershipAndOrganization,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'

export const toggleTestMode = protectedProcedure
  .input(
    z.object({
      livemode: z.boolean(),
    })
  )
  .mutation(async ({ input }) => {
    const membershipToUpdate = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { membership } =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        return { membership }
      }
    )
    /**
     * Need to bypass RLS to update the membership here,
     * so that we can continue the "can't update your own membership"
     * rule.
     */
    const updatedMembership = await adminTransaction(
      async ({ transaction }) => {
        return updateMembership(
          {
            id: membershipToUpdate.membership.id,
            livemode: input.livemode,
          },
          transaction
        )
      }
    )
    return {
      data: { membership: updatedMembership },
    }
  })
