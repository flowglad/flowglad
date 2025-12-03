/* eslint-disable no-console */
/* 
run the following in the terminal
bunx tsx src/scripts/verifyApiContract.ts
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import verifyApiContract from '@/api-contract/verify'
import runScript from './scriptRunner'

async function verifyApiContractScript(db: PostgresJsDatabase) {
  const logger = {
    info: console.log,
    warn: console.log,
    error: console.log,
  }
  await verifyApiContract(logger)
}

runScript(verifyApiContractScript)
