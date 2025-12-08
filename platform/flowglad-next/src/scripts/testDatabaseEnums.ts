/* testDatabaseEnums script with targeted environment
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/testDatabaseEnums.ts
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { testDatabaseEnums } from '@/db/testEnums'
import runScript from './scriptRunner'

export async function testDatabaseEnumsFn(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log('Testing database enum columns...')

  // Create a transaction
  await db.transaction(async (tx) => {
    await testDatabaseEnums(tx)

    // eslint-disable-next-line no-console
    console.log('All enum columns tested successfully!')
  })
}

runScript(testDatabaseEnumsFn)
