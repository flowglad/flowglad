/* testDatabaseEnums script with targeted environment
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/testDatabaseEnums.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { testDatabaseEnums } from '@/db/testEnums'

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
