/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/example.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import verifyApiContract from '@/api-contract/verify'
import { logger } from '@/utils/logger'

async function example(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`foo`)
  await verifyApiContract(logger)
}

runScript(example)
