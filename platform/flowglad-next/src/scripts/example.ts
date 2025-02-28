/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/example.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'

async function example(db: PostgresJsDatabase) {
  console.log(`foo`)
}

runScript(example)
