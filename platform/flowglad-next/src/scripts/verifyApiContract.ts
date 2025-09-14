/* eslint-disable no-console */
/* 
run the following in the terminal
pnpm tsx src/scripts/verfiyApiContract.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import verifyApiContract from '@/api-contract/verify'

async function verifyApiContractScript(db: PostgresJsDatabase) {
  const logger = {
    info: console.log,
    warn: console.log,
    error: console.log,
  }
  await verifyApiContract(logger)
}

runScript(verifyApiContractScript)
