/**
 * dbCopy - Copy a remote database to local and start the dev server
 *
 * Thin wrapper around pgcp that provides convenient --staging/--prod flags,
 * optional migration running, and automatic dev server startup.
 *
 * Usage:
 *   bun run dev:dbCopy:staging              # Copy staging, start dev
 *   bun run dev:dbCopy:staging:schema       # Copy staging schema only
 *   bun run dev:dbCopy:prod                 # Copy prod, start dev
 *   bun run dev:dbCopy:staging:migrate      # Copy staging + migrations
 *
 * Flags:
 *   --staging         Copy from STAGING_DATABASE_URL
 *   --prod            Copy from PROD_DATABASE_URL
 *   --port <number>   Local Supabase port (default: 54322)
 *   --schema-only     Skip data, only copy schema (faster)
 *   --run-migrations  Run pending migrations after copy
 *   --inspect         Keep dump files for inspection
 *   --no-dev          Don't start the dev server after copy
 *
 * For direct pgcp usage: bun run pgcp --help
 */

import { execSync, spawn } from 'child_process'
import path from 'path'

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_DB_PORT = 54322
const DEV_PORT = 3000

function getLocalDbUrl(port: number): string {
  return `postgresql://postgres:postgres@localhost:${port}/postgres`
}

// ============================================================================
// ANSI Colors
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

const SYMBOLS = {
  check: '\u2714',
  cross: '\u2716',
  info: '\u2139',
}

function logError(message: string): void {
  console.error(
    `${COLORS.red}${SYMBOLS.cross}${COLORS.reset} ${message}`
  )
}

function logSuccess(message: string): void {
  console.log(
    `${COLORS.green}${SYMBOLS.check}${COLORS.reset} ${message}`
  )
}

function logInfo(message: string): void {
  console.log(
    `${COLORS.cyan}${SYMBOLS.info}${COLORS.reset} ${message}`
  )
}

function logDim(message: string): void {
  console.log(`${COLORS.dim}${message}${COLORS.reset}`)
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface CloneOptions {
  source: 'staging' | 'prod'
  port: number
  schemaOnly: boolean
  runMigrations: boolean
  inspect: boolean
  noDev: boolean
}

function parseArgs(): CloneOptions {
  const args = process.argv.slice(2)

  const hasStaging = args.includes('--staging')
  const hasProd = args.includes('--prod')
  const schemaOnly = args.includes('--schema-only')
  const runMigrations = args.includes('--run-migrations')
  const inspect = args.includes('--inspect')
  const noDev = args.includes('--no-dev')

  // Parse --port flag
  let port = DEFAULT_DB_PORT
  const portIndex = args.indexOf('--port')
  if (portIndex !== -1 && args[portIndex + 1]) {
    const parsed = parseInt(args[portIndex + 1], 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      logError(`Invalid port: ${args[portIndex + 1]}`)
      process.exit(1)
    }
    port = parsed
  }

  if (hasStaging && hasProd) {
    logError('Cannot specify both --staging and --prod')
    process.exit(1)
  }

  if (!hasStaging && !hasProd) {
    logError('Must specify either --staging or --prod')
    process.exit(1)
  }

  return {
    source: hasStaging ? 'staging' : 'prod',
    port,
    schemaOnly,
    runMigrations,
    inspect,
    noDev,
  }
}

// ============================================================================
// Port Management
// ============================================================================

function killPort(port: number): void {
  try {
    // Find PIDs listening on the port and kill them
    const pids = execSync(`lsof -ti:${port} 2>/dev/null || true`, {
      encoding: 'utf-8',
    }).trim()

    if (pids) {
      const pidList = pids.split('\n').filter((p) => p.trim())
      for (const pid of pidList) {
        try {
          execSync(`kill -9 ${pid} 2>/dev/null || true`)
        } catch {
          // Ignore errors - process might have already exited
        }
      }
      logSuccess(`Killed process(es) on port ${port}`)
    } else {
      logDim(`No process running on port ${port}`)
    }
  } catch {
    // Ignore errors - port might not be in use
    logDim(`No process running on port ${port}`)
  }
}

// ============================================================================
// Dev Server
// ============================================================================

function startDevServer(port: number): void {
  const localDbUrl = getLocalDbUrl(port)
  console.log('')
  logInfo(`Starting dev server with local database...`)
  logDim(`DATABASE_URL=${localDbUrl}`)
  console.log('')

  // Start bun dev with the local database URL
  const child = spawn('bun', ['dev'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: localDbUrl,
    },
  })

  // Forward signals to child process
  process.on('SIGINT', () => {
    child.kill('SIGINT')
  })

  process.on('SIGTERM', () => {
    child.kill('SIGTERM')
  })

  child.on('close', (code) => {
    process.exit(code ?? 0)
  })

  child.on('error', (err) => {
    logError(`Failed to start dev server: ${err}`)
    process.exit(1)
  })
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs()

  // Build pgcp arguments
  const pgcpArgs: string[] = []

  // Add flags
  if (options.schemaOnly) {
    pgcpArgs.push('--schema-only')
  }
  if (options.inspect) {
    pgcpArgs.push('--keep-dumps')
  }

  // Add source and port (positional args for pgcp)
  const sourceEnvVar =
    options.source === 'staging'
      ? 'STAGING_DATABASE_URL'
      : 'PROD_DATABASE_URL'
  pgcpArgs.push(`env:${sourceEnvVar}`)

  // Add port if non-default
  if (options.port !== DEFAULT_DB_PORT) {
    pgcpArgs.push(String(options.port))
  }

  // Execute pgcp
  const pgcpPath = path.join(__dirname, 'pgcp.ts')

  const pgcpProcess = spawn('bun', ['run', pgcpPath, ...pgcpArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  })

  pgcpProcess.on('close', async (code) => {
    if (code !== 0) {
      // pgcp failed, exit with same code
      process.exit(code ?? 1)
    }

    // pgcp succeeded - run migrations if requested
    if (options.runMigrations) {
      console.log('')
      logInfo('Running migrations...')
      try {
        const localDbUrl = getLocalDbUrl(options.port)
        execSync(
          `DATABASE_URL="${localDbUrl}" bun run src/scripts/migrate.ts`,
          {
            cwd: process.cwd(),
            stdio: 'inherit',
          }
        )
        logSuccess('Migrations applied successfully')
      } catch (err) {
        logError(`Migration failed: ${err}`)
        process.exit(1)
      }
    }

    // Start dev server (unless --no-dev)
    if (options.noDev) {
      logInfo('Skipping dev server (--no-dev flag)')
      process.exit(0)
    }

    // Kill port 3000 and start dev server
    console.log('')
    killPort(DEV_PORT)
    startDevServer(options.port)
  })

  pgcpProcess.on('error', (err) => {
    logError(`Failed to run pgcp: ${err}`)
    process.exit(1)
  })
}

// Run
main().catch((err) => {
  logError(`Unexpected error: ${err}`)
  process.exit(1)
})
