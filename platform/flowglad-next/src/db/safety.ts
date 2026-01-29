/**
 * Database URL safety validation.
 *
 * This module provides protection against accidentally connecting to
 * production databases during local development. The check runs when
 * the database module is imported, which means:
 *
 * - Scripts that don't use the database are never blocked
 * - Scripts that use a local database pass automatically
 * - Scripts that use a remote database are blocked unless explicitly allowed
 *
 * Bypass conditions:
 * - VERCEL is set (Vercel deployments)
 * - CI is set (CI/CD pipelines)
 * - DANGEROUSLY_ALLOW_REMOTE_DB is set (explicit opt-out)
 */

/**
 * Patterns that identify a database URL as "local" and safe for development.
 */
export const LOCAL_HOST_PATTERNS = [
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
export function isLocalDatabaseUrl(url: string): boolean {
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
export function maskDatabaseUrl(url: string): string {
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
 * Get the command to bypass the safety check.
 * Uses npm_lifecycle_event when available (for `bun run <script>` commands),
 * otherwise falls back to a generic placeholder.
 */
export function getBypassCommand(): string {
  const scriptName = process.env.npm_lifecycle_event
  if (scriptName) {
    return `DANGEROUSLY_ALLOW_REMOTE_DB=1 bun run ${scriptName}`
  }
  return `DANGEROUSLY_ALLOW_REMOTE_DB=1 bun run <script>`
}

/**
 * Check if the safety check should be skipped based on environment.
 */
export function shouldSkipSafetyCheck(): boolean {
  return (
    process.env.VERCEL !== undefined ||
    process.env.CI !== undefined ||
    process.env.DANGEROUSLY_ALLOW_REMOTE_DB !== undefined
  )
}

/**
 * Validate that a DATABASE_URL is safe to use.
 *
 * @throws Error if the URL points to a non-local database and no bypass is set
 */
export function validateDatabaseUrl(url: string): void {
  if (shouldSkipSafetyCheck()) {
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
  ${getBypassCommand()}
`
    throw new Error(message)
  }
}
