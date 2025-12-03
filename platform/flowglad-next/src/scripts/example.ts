/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/example.ts
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'

async function example(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`foo`)
}

runScript(example)
