/**
 * safelyRunScript - A wrapper for running scripts against databases with local-only protection
 *
 * This script ensures that scripts can only be run against local databases by default,
 * preventing accidental execution against production or staging databases.
 *
 * Usage:
 *   bun run safely <script-path> --db <database-url>
 *   bun run safely <script-path> --db <database-url> --danger-mode
 *
 * Arguments:
 *   <script-path>   Path to the script to run (relative to cwd or absolute)
 *   --db <url>      Database URL to use
 *   --danger-mode   Allow running against non-local databases (DANGEROUS!)
 *
 * Examples:
 *   # Run against local test database
 *   bun run safely src/scripts/seed-countries.ts --db postgresql://test:test@localhost:5432/test_db
 *
 *   # Run against docker container database
 *   bun run safely src/scripts/migrate.ts --db postgresql://user:pass@127.0.0.1:5433/mydb
 *
 *   # Run against non-local database (requires --danger-mode)
 *   bun run safely src/scripts/migrate.ts --db postgresql://user:pass@prod.example.com:5432/db --danger-mode
 */

import { spawn } from 'child_process'

const LOCAL_HOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'host.docker.internal',
  'docker.for.mac.localhost',
  'docker.for.mac.host.internal',
  'host.containers.internal',
]

interface ParsedArgs {
  scriptPath: string | null
  databaseUrl: string | null
  dangerMode: boolean
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2)
  let scriptPath: string | null = null
  let databaseUrl: string | null = null
  let dangerMode = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--db' || arg === '--database') {
      const nextArg = args[i + 1]
      if (nextArg && !nextArg.startsWith('--')) {
        databaseUrl = nextArg
        i++
      }
    } else if (arg === '--danger-mode') {
      dangerMode = true
    } else if (!arg.startsWith('--') && !scriptPath) {
      scriptPath = arg
    }
  }

  return { scriptPath, databaseUrl, dangerMode }
}

function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Remove brackets from IPv6 addresses (URL parser returns [::1] as hostname)
    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')

    return LOCAL_HOST_PATTERNS.some(
      (pattern) =>
        hostname === pattern || hostname.endsWith('.' + pattern)
    )
  } catch {
    // If we can't parse the URL, assume it's not local for safety
    return false
  }
}

function maskDatabaseUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.error(`
Usage: bun run safely <script-path> --db <database-url> [--danger-mode]

Arguments:
  <script-path>   Path to the script to run (relative to cwd or absolute)
  --db <url>      Database URL to use (required)
  --danger-mode   Allow running against non-local databases (DANGEROUS!)

Examples:
  # Run against local test database
  bun run safely src/scripts/seed-countries.ts --db postgresql://test:test@localhost:5432/test_db

  # Run against docker container database
  bun run safely src/scripts/migrate.ts --db postgresql://user:pass@127.0.0.1:5433/mydb

  # Run against non-local database (requires --danger-mode)
  bun run safely src/scripts/migrate.ts --db "postgresql://..." --danger-mode

Recognized local hosts:
  ${LOCAL_HOST_PATTERNS.join(', ')}
`)
}

async function main(): Promise<void> {
  const { scriptPath, databaseUrl, dangerMode } = parseArgs()

  // Validate required arguments
  if (!scriptPath) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: Script path is required')
    printUsage()
    process.exit(1)
  }

  if (!databaseUrl) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ Error: Database URL is required (use --db flag)'
    )
    printUsage()
    process.exit(1)
  }

  // Check if database URL is local
  const isLocal = isLocalDatabaseUrl(databaseUrl)

  if (!isLocal && !dangerMode) {
    // eslint-disable-next-line no-console
    console.error(`
================================================================================
                              ❌ SAFETY CHECK FAILED
================================================================================

The database URL you provided does not appear to be a local database:

  ${maskDatabaseUrl(databaseUrl)}

This script only runs against local databases by default to prevent accidental
execution against production or staging environments.

Recognized local hosts: ${LOCAL_HOST_PATTERNS.join(', ')}

If you REALLY need to run this script against a non-local database,
add the --danger-mode flag:

  bun run safely ${scriptPath} --db "${maskDatabaseUrl(databaseUrl)}" --danger-mode

================================================================================
                          PROCEED WITH EXTREME CAUTION
================================================================================
`)
    process.exit(1)
  }

  if (dangerMode && !isLocal) {
    // eslint-disable-next-line no-console
    console.warn(`
================================================================================
                              ⚠️  DANGER MODE ENABLED
================================================================================

You are running a script against a NON-LOCAL database with --danger-mode.

Database: ${maskDatabaseUrl(databaseUrl)}
Script:   ${scriptPath}

This action may modify production or staging data. Proceed with caution.

================================================================================
`)
  }

  // Run the script with DATABASE_URL set
  // eslint-disable-next-line no-console
  console.info(`🚀 Running script: ${scriptPath}`)
  // eslint-disable-next-line no-console
  console.info(`📦 Database: ${maskDatabaseUrl(databaseUrl)}`)
  // eslint-disable-next-line no-console
  console.info(
    `🏠 Local database: ${isLocal ? 'Yes ✅' : 'No ⚠️ (DANGER MODE)'}`
  )
  // eslint-disable-next-line no-console
  console.info('')

  const child = spawn('bun', ['run', scriptPath], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  child.on('close', (code) => {
    process.exit(code ?? 0)
  })

  child.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to run script:', err)
    process.exit(1)
  })
}

// Export for programmatic use
export {
  isLocalDatabaseUrl,
  parseArgs,
  LOCAL_HOST_PATTERNS,
  type ParsedArgs,
}

// Run if executed directly
if (import.meta.main) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('❌ Error:', error)
    process.exit(1)
  })
}
