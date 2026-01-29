/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/updateUnkeyKeyTypes.ts
*/

import { FlowgladApiKeyType } from '@db-core/enums'
import { secretApiKeyMetadataSchema } from '@db-core/schema/apiKeys'
import { Unkey } from '@unkey/api'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { core } from '@/utils/core'
import runScript from './scriptRunner'

async function updateUnkeyKeyTypes(db: PostgresJsDatabase) {
  const unkey = new Unkey({
    rootKey: core.envVariable('UNKEY_ROOT_KEY'),
  })

  let cursor: string | undefined
  let listKeys: any[] = []

  while (true) {
    const listResponse = await unkey.apis.listKeys({
      apiId: core.envVariable('UNKEY_API_ID'),
      limit: 100,
      cursor,
    })

    listKeys = [...listKeys, ...listResponse.data]
    cursor = listResponse.pagination?.cursor

    if (!cursor) {
      break
    }
  }
  const secretKeys = listKeys.filter((key) =>
    key.name?.includes('Secret')
  )
  for (const key of secretKeys) {
    // eslint-disable-next-line no-console
    console.log(`updating ${key.name} (id: ${key.keyId})`)
    // eslint-disable-next-line no-console
    console.log('key.meta', key.meta)
    const parsedMeta = secretApiKeyMetadataSchema.parse({
      userId: key.meta?.userId,
      type: FlowgladApiKeyType.Secret,
    })
    // eslint-disable-next-line no-console
    console.log('parsedMeta', parsedMeta)
    await unkey.keys.updateKey({
      keyId: key.keyId,
      meta: parsedMeta,
    })
    // eslint-disable-next-line no-console
    console.log(
      `updated ${key.name} (unkey id: ${key.keyId})
==============================================`
    )
  }
}

runScript(updateUnkeyKeyTypes)
