/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/example.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'

async function example(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`foo`)
}

runScript(example)
