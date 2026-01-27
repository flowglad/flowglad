import { DefaultLogger } from 'drizzle-orm/logger'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { format } from 'sql-formatter'
import core from '@/utils/core'

// ============================================================================
// Database URL Safety Check
// ============================================================================

/**
 * Patterns that identify a database URL as "local" and safe for development.
 */
const LOCAL_HOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '.local',
  'host.docker.internal',
] as const

/**
 * Check if a database URL points to a local database.
 */
function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    let hostname = parsed.hostname.toLowerCase()

    // Strip IPv6 brackets if present
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1)
    }

    return LOCAL_HOST_PATTERNS.some((pattern) => {
      if (pattern.startsWith('.')) {
        return hostname.endsWith(pattern)
      }
      return hostname === pattern
    })
  } catch {
    return false
  }
}

/**
 * Mask credentials in a database URL for safe display in error messages.
 */
function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.password) {
      parsed.password = '****'
      return parsed.toString()
    }
    return url
  } catch {
    return '(invalid URL)'
  }
}

/**
 * Validate that DATABASE_URL is safe to use.
 *
 * This check runs when the database module is imported, which means:
 * - Scripts that don't use the database never trigger this check
 * - Scripts that use a local database pass automatically
 * - Scripts that use a remote database are blocked unless explicitly allowed
 *
 * Bypass conditions:
 * - VERCEL is set (Vercel deployments)
 * - CI is set (CI/CD pipelines)
 * - DANGEROUSLY_ALLOW_REMOTE_DB is set (explicit opt-out)
 */
function validateDatabaseUrl(url: string): void {
  // Skip in production/CI environments
  if (
    process.env.VERCEL !== undefined ||
    process.env.CI !== undefined ||
    process.env.DANGEROUSLY_ALLOW_REMOTE_DB !== undefined
  ) {
    return
  }

  if (!isLocalDatabaseUrl(url)) {
    const maskedUrl = maskDatabaseUrl(url)
    const message = `
BLOCKED: DATABASE_URL points to non-local database.
${maskedUrl}

This safety check prevents accidental writes to production databases.
It runs when the database module is imported.

Recognized local hosts:
${LOCAL_HOST_PATTERNS.map((p) => `  - ${p}`).join('\n')}

To bypass this check:
  DANGEROUSLY_ALLOW_REMOTE_DB=1 bun run <script>
`
    throw new Error(message)
  }
}

// ============================================================================
// Database Client Initialization
// ============================================================================

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
