/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/updateUnkeyKeyTypes.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { core } from '@/utils/core'
import { Unkey } from '@unkey/api'
import { FlowgladApiKeyType } from '@/types'
import { secretApiKeyMetadataSchema } from '@/db/schema/apiKeys'

async function updateUnkeyKeyTypes(db: PostgresJsDatabase) {
  const unkey = new Unkey({
    rootKey: core.envVariable('UNKEY_ROOT_KEY'),
  })

  let cursor: string | undefined = undefined
  let listKeys: any[] = []

  while (true) {
    const listResults = await unkey.apis.listKeys({
      apiId: core.envVariable('UNKEY_API_ID'),
      limit: 100,
      cursor,
    })

    if (!listResults.result) {
      break
    }

    listKeys = [...listKeys, ...listResults.result.keys]
    cursor = listResults.result.cursor

    if (!cursor) {
      break
    }
  }
  const secretKeys = listKeys.filter((key) =>
    key.name?.includes('Secret')
  )
  for (const key of secretKeys) {
    // eslint-disable-next-line no-console
    console.log(`updating ${key.name} (id: ${key.id})`)
    // eslint-disable-next-line no-console
    console.log('key.meta', key.meta)
    const parsedMeta = secretApiKeyMetadataSchema.parse({
      userId: key.meta.userId,
      type: FlowgladApiKeyType.Secret,
    })
    // eslint-disable-next-line no-console
    console.log('parsedMeta', parsedMeta)
    await unkey.keys.update({
      keyId: key.id,
      meta: parsedMeta,
    })
    // eslint-disable-next-line no-console
    console.log(
      `updated ${key.name} (unkey id: ${key.id})
==============================================`
    )
  }
}

runScript(updateUnkeyKeyTypes)
