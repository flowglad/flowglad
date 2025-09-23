/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/example.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { seedDatabase } from '@/../seedDatabase'

async function example(_db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`foo`)
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('Cannot seed database in production')
  }
  await seedDatabase()
}

runScript(example)
