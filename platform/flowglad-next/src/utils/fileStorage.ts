import type { File } from '@/db/schema/files'
import { insertFile } from '@/db/tableMethods/fileMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import type { DbTransaction } from '@/db/types'
import core from '@/utils/core'
import { getHeadObject } from './cloudflare'

export const safeObjectKeyToFileInsert = async (
  clientInsert: File.ClientInsert,
  userId: string,
  livemode: boolean,
  transaction: DbTransaction
) => {
  const organizations = await selectMembershipAndOrganizations(
    { userId, focused: true },
    transaction
  )

  if (!organizations.length) {
    throw new Error('User is not a member of any organization')
  }

  // Get the R2 object metadata
  const r2Object = await getHeadObject(clientInsert.objectKey)

  if (!r2Object) {
    throw new Error('File not found in storage')
  }

  const fileInsert: File.Insert = {
    ...clientInsert,
    sizeKb: r2Object.ContentLength
      ? r2Object.ContentLength / 1024
      : 0,
    contentType: r2Object.ContentType ?? '',
    cdnUrl: core.safeUrl(
      clientInsert.objectKey,
      process.env.NEXT_PUBLIC_CDN_URL!
    ),
    contentHash: r2Object.ETag!,
    etag: r2Object.ETag!,
    organizationId: organizations[0].organization.id,
    livemode,
  }

  return fileInsert
}

export const insertFileTransaction = async (
  file: File.ClientInsert,
  userId: string,
  livemode: boolean,
  transaction: DbTransaction
) => {
  // Create file record with metadata from R2
  const fileInsert = await safeObjectKeyToFileInsert(
    file,
    userId,
    livemode,
    transaction
  )
  return insertFile({ ...fileInsert, livemode }, transaction)
}
