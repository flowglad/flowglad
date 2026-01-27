import { DefaultLogger } from 'drizzle-orm/logger'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { format } from 'sql-formatter'
import core from '@/utils/core'
import { validateDatabaseUrl } from './safety'

const dbUrl = core.IS_TEST
  ? core.TEST_DB_URL
  : core.envVariable('DATABASE_URL')

// Validate the database URL before creating the client
if (dbUrl) {
  validateDatabaseUrl(dbUrl)
}
/**
 * Very important to set prepare to false when connecting to a Supabase DB
 * via the connection pool URL in the "transaction" batch setting.
 * Supabase's connection pool URL does not support prepared statements
 * in transaction mode.
 *
 * If you don't set `prepare: false`, your DB will silently fail to execute
 * any more than 1 transaction per request.
 * @see https://orm.drizzle.team/docs/get-started-postgresql#supabase
 * @see https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-drizzle
 */
const client = postgres(dbUrl, {
  max: 15,
  idle_timeout: 5,
  prepare: false,
  debug: true,
})

class FormattedSQLLogger extends DefaultLogger {
  override logQuery(query: string, params: unknown[]): void {
    const formatted = format(query, {
      language: 'postgresql',
      tabWidth: 2,
      keywordCase: 'upper',
      linesBetweenQueries: 2,
    })

    /* eslint-disable no-console */
    console.log('\n🔵 SQL Query:')
    console.log(formatted)
    if (params.length > 0) {
      console.log('\n📊 Parameters:', JSON.stringify(params, null, 2))
    }
    console.log('─'.repeat(80)) // Separator
    /* eslint-enable no-console */
  }
}

let logger: boolean | FormattedSQLLogger = true

if (core.IS_PROD) {
  logger = true
} else if (core.IS_TEST) {
  logger = false
} else if (core.IS_DEV) {
  logger = new FormattedSQLLogger()
}

/**
 * The main database instance.
 */
export const db = drizzle(client, {
  logger,
})

export default db
