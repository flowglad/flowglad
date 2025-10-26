/* eslint-disable no-console */
/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/upgradeUnkeyApiKeysToSchema.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { unkey } from '@/utils/unkey'
import { core } from '@/utils/core'
import {
  billingPortalApiKeyMetadataSchema,
  secretApiKeyMetadataSchema,
} from '@/db/schema/apiKeys'
import { FlowgladApiKeyType } from '@/types'

async function upgradeUnkeyApiKeysToSchema(db: PostgresJsDatabase) {
  let allKeys: {
    id: string
    meta?: {
      [key: string]: unknown
    }
  }[] = []
  let cursor = undefined
  do {
    const response = await unkey().apis.listKeys({
      apiId: core.envVariable('UNKEY_API_ID'),
      limit: 100,
      cursor,
    })
    if (!response.result) break
    allKeys = [...allKeys, ...response.result.keys]
    cursor = response.result.cursor
  } while (cursor)
  const unkeyKeys = { result: { keys: allKeys } }

  if (!unkeyKeys.result) {
    throw new Error('No keys found')
  }
  console.log(`Found ${unkeyKeys.result.keys.length} keys`)
  for (const key of unkeyKeys.result.keys) {
    if (key.meta?.type === FlowgladApiKeyType.Secret) {
      const metaParseResult = secretApiKeyMetadataSchema.safeParse(
        key.meta
      )
      if (!metaParseResult.success) {
        console.error(
          `Invalid secret key metadata for ${key.id}: ${metaParseResult.error}`
        )
      }
    } else if (
      key.meta?.type === FlowgladApiKeyType.BillingPortalToken
    ) {
      const metaParseResult =
        billingPortalApiKeyMetadataSchema.safeParse(key.meta)
      if (!metaParseResult.success) {
        console.error(
          `Invalid billing portal key metadata for ${key.id}: ${metaParseResult.error}`
        )
      }
    }
  }
}

runScript(upgradeUnkeyApiKeysToSchema)
