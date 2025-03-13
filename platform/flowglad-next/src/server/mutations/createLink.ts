import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { createLinkInputSchema } from '@/db/schema/links'
import { insertLink } from '@/db/tableMethods/linkMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'

export const createLink = protectedProcedure
  .input(createLinkInputSchema)
  .mutation(async ({ input, ctx }) => {
    const link = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )
        return insertLink(
          {
            ...input.link,
            organizationId: organization.id,
            livemode,
          },
          transaction
        )
      }
    )

    return {
      link,
    }
  })
