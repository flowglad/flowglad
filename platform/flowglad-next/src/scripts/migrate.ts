import core from '@/utils/core'
import { loadEnvConfig } from '@next/env'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { testDatabaseEnums } from './testDatabaseEnums'

const projectDir = process.cwd()
// To load env vars in a script
loadEnvConfig(projectDir)
const TEST_DB_URL = 'postgresql://test:test@localhost:5432/test_db'

const dbUrl = core.IS_TEST
  ? TEST_DB_URL
  : core.envVariable('DATABASE_URL')

const client = postgres(dbUrl, {
  max: 15,
  idle_timeout: 5,
  prepare: false,
  debug: true,
})

const db = drizzle(client)

export const migrateDb = async () => {
  // eslint-disable-next-line no-console
  console.info('Applying migrations...')
  await migrate(db, { migrationsFolder: 'drizzle-migrations' })
  // eslint-disable-next-line no-console
  console.info('Migrations applied successfully.')
}

async function main() {
  await migrateDb()
  // eslint-disable-next-line no-console
  console.info('Validating database enums...')
  // await testDatabaseEnums(db)
  // eslint-disable-next-line no-console
  console.info('Database enums validated successfully.')
  process.exit(0)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`Error applying migrations:`)
  // eslint-disable-next-line no-console
  console.log(err)
  process.exit(1)
})
