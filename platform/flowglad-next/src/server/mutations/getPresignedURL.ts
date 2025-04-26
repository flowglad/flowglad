import { z } from 'zod'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import cloudflareMethods from '@/utils/cloudflare'

const getPresignedURLSchema = z.object({
  key: z.string(),
  contentType: z.string(),
  directory: z.string(),
})

export const getPresignedURL = protectedProcedure
  .input(getPresignedURLSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { key, contentType, directory } = input

        // Get the organization for the user
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )

        if (!organization) {
          throw new Error('User does not belong to any organization')
        }

        const { presignedURL, publicURL, objectKey } =
          await cloudflareMethods.getPresignedURL({
            directory,
            key,
            contentType,
            organizationId: organization.id,
          })

        return {
          data: {
            objectKey,
            presignedURL,
            publicURL,
          },
        }
      }
    )
  })
