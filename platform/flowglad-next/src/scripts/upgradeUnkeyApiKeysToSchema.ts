/* eslint-disable no-console */
/*
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/upgradeUnkeyApiKeysToSchema.ts
*/

import { FlowgladApiKeyType } from '@db-core/enums'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { secretApiKeyMetadataSchema } from '@/db/schema/apiKeys'
import { core } from '@/utils/core'
import { unkey } from '@/utils/unkey'
import runScript from './scriptRunner'

async function upgradeUnkeyApiKeysToSchema(db: PostgresJsDatabase) {
  let allKeys: Array<{
    keyId: string
    meta?: {
      [key: string]: unknown
    }
  }> = []
  let cursor
  do {
    const response = await unkey().apis.listKeys({
      apiId: core.envVariable('UNKEY_API_ID'),
      limit: 100,
      cursor,
    })
    allKeys = [...allKeys, ...response.data]
    cursor = response.pagination?.cursor
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
          `Invalid secret key metadata for ${key.keyId}: ${metaParseResult.error}`
        )
      }
    }
  }
}

runScript(upgradeUnkeyApiKeysToSchema)
