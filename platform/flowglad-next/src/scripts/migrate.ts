import core from '@/utils/core'
import { loadEnvConfig } from '@next/env'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { testDatabaseEnums } from '@/db/testEnums'

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
  //   if (core.IS_TEST) {
  //     console.log(
  //       '[testmode only] Granting permissions to authenticated user...'
  //     )
  //     await db.execute(
  //       sql`
  // -- Grant SELECT, INSERT, UPDATE permissions on all existing tables
  // GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;

  // -- For future tables (make sure new tables automatically get these permissions)
  // ALTER DEFAULT PRIVILEGES IN SCHEMA public
  // GRANT SELECT, INSERT, UPDATE ON TABLES TO authenticated;
  // `
  //     )
  //   }
  // eslint-disable-next-line no-console
  console.info('Migrations applied successfully.')
}

async function main() {
  await migrateDb()
  // eslint-disable-next-line no-console
  console.info('Validating database enums...')
  await db.transaction(async (tx) => {
    await testDatabaseEnums(tx)
  })
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
