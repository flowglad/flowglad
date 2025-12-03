/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/example.ts
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { seedDatabase } from '@/../seedDatabase'
import runScript from './scriptRunner'

async function example(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`foo`)
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('Cannot seed database in production')
  }
  await seedDatabase()
}

runScript(example)
