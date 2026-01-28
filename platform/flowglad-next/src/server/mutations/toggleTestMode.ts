import { Result } from 'better-result'
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
    const txResult1 = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { membership } =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        return Result.ok({ membership })
      }
    )
    const membershipToUpdate = txResult1.unwrap()
    /**
     * Need to bypass RLS to update the membership here,
     * so that we can continue the "can't update your own membership"
     * rule.
     */
    const txResult2 = await adminTransaction(
      async ({ transaction }) => {
        const result = await updateMembership(
          {
            id: membershipToUpdate.membership.id,
            livemode: input.livemode,
          },
          transaction
        )
        return Result.ok(result)
      }
    )
    const updatedMembership = txResult2.unwrap()
    return {
      data: { membership: updatedMembership },
    }
  })
