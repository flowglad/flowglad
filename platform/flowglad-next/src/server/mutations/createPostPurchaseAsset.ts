import { protectedProcedure } from '@/server/trpc'
import { File } from '@/db/schema/files'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { insertFile } from '@/db/tableMethods/fileMethods'
import { safeObjectKeyToFileInsert } from '@/utils/fileStorage'
import {
  createPostPurchaseAssetInputSchema,
  Link,
} from '@/db/schema/links'
import { insertLink } from '@/db/tableMethods/linkMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'

export const createPostPurchaseAsset = protectedProcedure
  .input(createPostPurchaseAssetInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { fileRecord, linkRecord } = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        let fileRecord: File.Record | null = null
        let linkRecord: Link.Record | null = null
        if ('file' in input) {
          // Create file record with metadata from R2
          const fileInsert = await safeObjectKeyToFileInsert(
            input.file,
            userId,
            livemode,
            transaction
          )
          fileRecord = await insertFile(
            { ...fileInsert, livemode: ctx.livemode },
            transaction
          )
        }

        if ('link' in input) {
          const [{ organization }] =
            await selectMembershipAndOrganizations(
              {
                userId,
                focused: true,
              },
              transaction
            )
          linkRecord = await insertLink(
            {
              ...input.link,
              organizationId: organization.id,
              livemode,
            },
            transaction
          )
        }
        return { fileRecord, linkRecord }
      }
    )

    return {
      file: fileRecord,
      link: linkRecord,
    }
  })
