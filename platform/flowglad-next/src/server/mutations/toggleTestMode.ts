import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectFocusedMembershipAndOrganization,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { protectedProcedure } from '@/server/trpc'

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
      },
      { operationName: 'selectFocusedMembershipForTestModeToggle' }
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
      },
      { operationName: 'updateMembershipLivemode' }
    )
    return {
      data: { membership: updatedMembership },
    }
  })
