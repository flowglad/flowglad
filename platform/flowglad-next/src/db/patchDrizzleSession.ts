import { PostgresJsSession } from 'drizzle-orm/postgres-js'
import { getCurrentOperationName } from '@/utils/operationContext'

/**
 * Sanitize operation name to prevent SQL injection in comments.
 * Only allows alphanumeric, dots, underscores, hyphens.
 * Truncates to 100 characters.
 */
function sanitizeForComment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

/**
 * Monkey-patch Drizzle's PostgresJsSession to prepend SQL comments
 * with the current operation name from AsyncLocalStorage context.
 *
 * This makes the operation name visible in pg_stat_statements,
 * enabling correlation of slow queries with business operations.
 *
 * Must be imported BEFORE any Drizzle queries are executed.
 */
const originalPrepareQuery = PostgresJsSession.prototype.prepareQuery

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(PostgresJsSession.prototype as any).prepareQuery = function (
  query: { sql: string; params: unknown[] },
  ...rest: unknown[]
) {
  const operationName = getCurrentOperationName()
  if (operationName) {
    const sanitized = sanitizeForComment(operationName)
    query = {
      ...query,
      sql: `/* op:${sanitized} */ ${query.sql}`,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalPrepareQuery as any).apply(this, [query, ...rest])
}

// Export sanitizeForComment for testing
export { sanitizeForComment }
