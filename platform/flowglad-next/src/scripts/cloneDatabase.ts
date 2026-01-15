/**
 * Clone a remote Supabase database (staging or prod) to a local Supabase instance.
 *
 * Usage:
 *   bun run db:clone:staging              # Clone staging with data
 *   bun run db:clone:staging:schema       # Clone staging schema only
 *   bun run db:clone:prod                 # Clone prod with data
 *   bun run db:clone:prod:schema          # Clone prod schema only
 *   bun run db:clone:staging:migrate      # Clone staging and run migrations
 *   bun run db:clone:prod:migrate         # Clone prod and run migrations
 *
 * Flags:
 *   --staging         Clone from STAGING_DATABASE_URL
 *   --prod            Clone from PROD_DATABASE_URL
 *   --schema-only     Skip data, only clone schema (faster)
 *   --run-migrations  Run pending migrations after cloning
 *   --inspect         Keep dump files for inspection (not cleaned up)
 *
 * Prerequisites:
 *   - Supabase CLI installed: brew install supabase/tap/supabase
 *   - Docker running
 *   - Supabase initialized: supabase init (run once in platform/flowglad-next)
 *   - Environment variables set: STAGING_DATABASE_URL, PROD_DATABASE_URL
 */

import { loadEnvConfig } from '@next/env'
import { type ExecSyncOptions, execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { sleep } from '../utils/core'

// Load environment variables
const projectDir = process.cwd()
loadEnvConfig(projectDir)

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  DUMP_BUFFER_SIZE: 1024 * 1024 * 500, // 500MB for large databases
  DUMP_DIR: '.supabase-dumps',
  LOCAL_DB_PORT: 54322,
  LOCAL_DB_URL:
    'postgresql://postgres:postgres@localhost:54322/postgres',
  HEALTH_CHECK_RETRIES: 30,
  HEALTH_CHECK_INTERVAL_MS: 1000,
} as const

// ============================================================================
// Types
// ============================================================================

interface CloneOptions {
  source: 'staging' | 'prod'
  schemaOnly: boolean
  runMigrations: boolean
  inspect: boolean
}

interface DumpResult {
  rolesFile: string
  schemaFile: string
  dataFile: string | null
}

interface MigrationResult {
  success: boolean
  output: string
  error?: string
}

// ============================================================================
// Logging Utilities
// ============================================================================

function log(message: string, emoji = ''): void {
  console.log(`${emoji} ${message}`.trim())
}

function logError(message: string): void {
  console.error(`\x1b[31m\u2716\x1b[0m ${message}`)
}

function logSuccess(message: string): void {
  console.log(`\x1b[32m\u2714\x1b[0m ${message}`)
}

function logWarn(message: string): void {
  console.log(`\x1b[33m\u26A0\x1b[0m ${message}`)
}

function logInfo(message: string): void {
  console.log(`\x1b[36m\u2139\x1b[0m ${message}`)
}

// ============================================================================
// Command Execution Utilities
// ============================================================================

function runCommand(
  command: string,
  options: ExecSyncOptions = {}
): string | Buffer {
  const defaultOptions: ExecSyncOptions = {
    stdio: 'inherit',
    cwd: projectDir,
    maxBuffer: CONFIG.DUMP_BUFFER_SIZE,
  }
  return execSync(command, { ...defaultOptions, ...options })
}

function runCommandQuiet(command: string): string {
  return execSync(command, {
    cwd: projectDir,
    encoding: 'utf-8',
    maxBuffer: CONFIG.DUMP_BUFFER_SIZE,
    stdio: 'pipe',
  }).trim()
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): CloneOptions {
  const args = process.argv.slice(2)

  const hasStaging = args.includes('--staging')
  const hasProd = args.includes('--prod')
  const schemaOnly = args.includes('--schema-only')
  const runMigrations = args.includes('--run-migrations')
  const inspect = args.includes('--inspect')

  if (hasStaging && hasProd) {
    throw new Error('Cannot specify both --staging and --prod')
  }

  if (!hasStaging && !hasProd) {
    throw new Error('Must specify either --staging or --prod')
  }

  return {
    source: hasStaging ? 'staging' : 'prod',
    schemaOnly,
    runMigrations,
    inspect,
  }
}

function getSourceDatabaseUrl(source: 'staging' | 'prod'): string {
  const envKey =
    source === 'staging'
      ? 'STAGING_DATABASE_URL'
      : 'PROD_DATABASE_URL'
  const url = process.env[envKey]

  if (!url) {
    throw new Error(
      `${envKey} environment variable is not set. ` +
        'Make sure it exists in .env.local or pull from Vercel.\n' +
        'Get the connection string from Supabase Dashboard > Connect > Connection string'
    )
  }

  return url
}

// ============================================================================
// Prerequisite Checks
// ============================================================================

function checkPrerequisites(): void {
  logInfo('Checking prerequisites...')

  // Check Docker
  try {
    runCommandQuiet('docker info 2>/dev/null')
    logSuccess('Docker is running')
  } catch {
    throw new Error(
      'Docker is not running. Please start Docker and try again.'
    )
  }

  // Check Supabase CLI
  try {
    runCommandQuiet('which supabase')
    logSuccess('Supabase CLI is installed')
  } catch {
    throw new Error(
      'Supabase CLI is not installed. Please install it:\n' +
        '  brew install supabase/tap/supabase'
    )
  }

  // Check psql
  try {
    runCommandQuiet('which psql')
    logSuccess('psql is available')
  } catch {
    throw new Error(
      'psql is not installed. Please install PostgreSQL client tools:\n' +
        '  macOS: brew install libpq && brew link --force libpq'
    )
  }

  // Check supabase/config.toml exists
  const configPath = path.join(projectDir, 'supabase', 'config.toml')
  try {
    runCommandQuiet(`test -f "${configPath}"`)
    logSuccess('Supabase project initialized')
  } catch {
    throw new Error(
      'Supabase is not initialized in this project.\n' +
        'Run: supabase init'
    )
  }
}

// ============================================================================
// Supabase Local Management
// ============================================================================

async function stopLocalSupabase(): Promise<void> {
  log('Stopping any existing Supabase containers...', '\uD83D\uDED1')
  try {
    runCommand('supabase stop --no-backup', { stdio: 'pipe' })
  } catch {
    // Ignore errors - containers might not be running
    logInfo('No existing containers to stop')
  }
}

async function startLocalSupabase(): Promise<void> {
  log('Starting local Supabase instance...', '\uD83D\uDE80')
  runCommand('supabase start')

  logInfo('Waiting for Postgres to be ready...')
  await waitForPostgres()
  logSuccess('Local Supabase is ready!')
}

async function waitForPostgres(): Promise<void> {
  for (let i = 0; i < CONFIG.HEALTH_CHECK_RETRIES; i++) {
    try {
      runCommandQuiet(
        `psql "${CONFIG.LOCAL_DB_URL}" -c "SELECT 1" 2>/dev/null`
      )
      return
    } catch {
      await sleep(CONFIG.HEALTH_CHECK_INTERVAL_MS)
    }
  }
  throw new Error('Postgres failed to become ready in time')
}

// ============================================================================
// Database Dump Operations
// ============================================================================

async function ensureDumpDir(): Promise<string> {
  const dumpDir = path.join(projectDir, CONFIG.DUMP_DIR)
  await fs.mkdir(dumpDir, { recursive: true })
  return dumpDir
}

async function dumpRemoteDatabase(
  sourceUrl: string,
  options: CloneOptions
): Promise<DumpResult> {
  const dumpDir = await ensureDumpDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const prefix = `${options.source}-${timestamp}`

  // Dump roles (cluster-level, needed for RLS policies)
  log(`Dumping roles from ${options.source}...`, '\uD83D\uDCE4')
  const rolesFile = path.join(dumpDir, `${prefix}-roles.sql`)

  runCommand(
    `supabase db dump --db-url "${sourceUrl}" --role-only -f "${rolesFile}"`
  )
  logSuccess(`Roles dumped to ${rolesFile}`)

  // Dump schema
  log(`Dumping schema from ${options.source}...`, '\uD83D\uDCE4')
  const schemaFile = path.join(dumpDir, `${prefix}-schema.sql`)

  runCommand(
    `supabase db dump --db-url "${sourceUrl}" -f "${schemaFile}"`
  )
  logSuccess(`Schema dumped to ${schemaFile}`)

  let dataFile: string | null = null

  if (!options.schemaOnly) {
    log(`Dumping data from ${options.source}...`, '\uD83D\uDCE4')
    logInfo('(This may take a while for large databases)')
    dataFile = path.join(dumpDir, `${prefix}-data.sql`)

    runCommand(
      `supabase db dump --db-url "${sourceUrl}" --data-only --use-copy -f "${dataFile}"`
    )
    logSuccess(`Data dumped to ${dataFile}`)
  }

  return { rolesFile, schemaFile, dataFile }
}

// ============================================================================
// Database Restore Operations
// ============================================================================

/**
 * Safely quote a PostgreSQL identifier to prevent SQL injection.
 * Wraps the identifier in double quotes and escapes any embedded double quotes.
 */
function quoteIdentifier(identifier: string): string {
  // PostgreSQL identifier quoting: wrap in double quotes, escape " as ""
  return `"${identifier.replace(/"/g, '""')}"`
}

async function grantRolesToPostgres(): Promise<void> {
  log('Granting roles to postgres user...', '\uD83D\uDD11')

  // Dynamically discover all non-system roles that should be grantable
  // This avoids hardcoding role names and automatically picks up new custom roles
  const rolesQuery = `
    SELECT rolname FROM pg_roles
    WHERE rolname NOT LIKE 'pg_%'
    AND rolname != 'postgres'
    AND NOT rolsuper
  `.replace(/\n/g, ' ')

  try {
    const result = runCommandQuiet(
      `psql "${CONFIG.LOCAL_DB_URL}" -t -A -c "${rolesQuery}"`
    )

    const roles = result.split('\n').filter((r) => r.trim())
    logInfo(`Found ${roles.length} roles to grant`)

    for (const role of roles) {
      try {
        // Use quoted identifier to safely handle special characters and prevent SQL injection
        const quotedRole = quoteIdentifier(role)
        runCommand(
          `psql "${CONFIG.LOCAL_DB_URL}" -c "GRANT ${quotedRole} TO postgres;"`,
          { stdio: 'pipe' }
        )
        logSuccess(`Granted ${role} to postgres`)
      } catch {
        // Role might already be granted or have issues - continue
        logWarn(`Could not grant ${role} to postgres`)
      }
    }
  } catch (err) {
    logError(`Could not discover roles dynamically: ${err}`)
    throw new Error('Failed to grant roles - role discovery failed')
  }
}

async function restoreToLocal(dumpResult: DumpResult): Promise<void> {
  const { rolesFile, schemaFile, dataFile } = dumpResult

  // Restore roles first (needed for RLS policies)
  log('Restoring roles to local Supabase...', '\uD83D\uDCE5')
  // Don't use ON_ERROR_STOP for roles - some roles may already exist
  runCommand(`psql "${CONFIG.LOCAL_DB_URL}" -f "${rolesFile}"`, {
    stdio: 'inherit',
  })
  logSuccess('Roles restored!')

  // Grant roles to postgres so SET ROLE works locally
  await grantRolesToPostgres()

  // Restore schema
  log('Restoring schema to local Supabase...', '\uD83D\uDCE5')
  runCommand(
    `psql "${CONFIG.LOCAL_DB_URL}" -v ON_ERROR_STOP=1 -f "${schemaFile}"`,
    { stdio: 'inherit' }
  )
  logSuccess('Schema restored!')

  // Restore data with triggers disabled
  if (dataFile) {
    log('Restoring data to local Supabase...', '\uD83D\uDCE5')
    logInfo('(Disabling triggers during restore)')

    // Use session_replication_role=replica to disable triggers
    // This prevents trigger execution during bulk insert
    runCommand(
      `psql "${CONFIG.LOCAL_DB_URL}" -c "SET session_replication_role = replica;" -f "${dataFile}" -c "SET session_replication_role = DEFAULT;"`,
      { stdio: 'inherit' }
    )
    logSuccess('Data restored!')
  }
}

// ============================================================================
// Migration Operations
// ============================================================================

function runMigrations(): MigrationResult {
  log('Running pending migrations...', '\uD83D\uDD04')

  /**
   * Note: We don't disable triggers for migrations (unlike data restore).
   * The session_replication_role parameter requires superuser privileges which
   * the local Supabase postgres user doesn't have when using Drizzle ORM connections.
   * Migrations are typically DDL operations that don't trigger problematic triggers.
   */

  try {
    const output = execSync(
      `DATABASE_URL="${CONFIG.LOCAL_DB_URL}" bun run src/scripts/migrate.ts 2>&1`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: projectDir,
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer for large output
      }
    )

    // Display the output
    console.log(output)
    logSuccess('Migrations applied successfully!')

    return { success: true, output }
  } catch (error) {
    const execError = error as {
      stdout?: string
      stderr?: string
      message?: string
    }
    const output = execError.stdout || execError.stderr || ''

    // Display the error output
    if (output) {
      console.log(output)
    }

    logError('Migration failed!')

    return {
      success: false,
      output,
      error: execError.message || 'Unknown error',
    }
  }
}

// ============================================================================
// Cleanup Operations
// ============================================================================

async function cleanupDumpFiles(
  dumpResult: DumpResult
): Promise<void> {
  log('Cleaning up dump files...', '\uD83E\uDDF9')

  try {
    await fs.unlink(dumpResult.rolesFile)
    await fs.unlink(dumpResult.schemaFile)
    if (dumpResult.dataFile) {
      await fs.unlink(dumpResult.dataFile)
    }
    logSuccess('Dump files cleaned up')
  } catch (err) {
    logWarn(`Could not clean up dump files: ${err}`)
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  console.log('')
  log('='.repeat(60))
  log('Supabase Database Clone Tool', '\uD83D\uDDC4\uFE0F')
  log('='.repeat(60))
  console.log('')

  // Parse arguments
  const options = parseArgs()
  logInfo(`Source: ${options.source}`)
  logInfo(`Schema only: ${options.schemaOnly}`)
  logInfo(`Run migrations: ${options.runMigrations}`)
  logInfo(`Inspect mode: ${options.inspect}`)
  console.log('')

  // Check prerequisites
  checkPrerequisites()
  console.log('')

  // Get source database URL
  const sourceUrl = getSourceDatabaseUrl(options.source)
  logInfo(`Cloning from ${options.source} database...`)

  let migrationResult: MigrationResult | null = null

  try {
    // Step 1: Stop any existing local Supabase (idempotent)
    await stopLocalSupabase()

    // Step 2: Start fresh local Supabase
    await startLocalSupabase()
    console.log('')

    // Step 3: Dump remote database
    const dumpResult = await dumpRemoteDatabase(sourceUrl, options)
    console.log('')

    // Step 4: Restore to local
    await restoreToLocal(dumpResult)
    console.log('')

    // Step 5: Run migrations (if requested)
    if (options.runMigrations) {
      migrationResult = runMigrations()
      console.log('')
    }

    // Step 6: Cleanup (unless inspect mode)
    if (!options.inspect) {
      await cleanupDumpFiles(dumpResult)
    } else {
      logInfo(
        `Dump files preserved for inspection in: ${CONFIG.DUMP_DIR}`
      )
    }

    // Success summary
    console.log('')
    log('='.repeat(60))

    if (migrationResult && !migrationResult.success) {
      logError('Clone completed but migrations FAILED')
      log('='.repeat(60))
      console.log('')
      logInfo('The database is cloned but migrations did not apply.')
      logInfo('Review the error above and fix the migration issues.')
      console.log('')
      logInfo('Useful commands:')
      console.log(
        '  bun run db:local:status  - Check Supabase status'
      )
      console.log('  bun run db:local:stop    - Stop local Supabase')
      console.log('')
      process.exit(1)
    }

    logSuccess('Database clone completed successfully!')
    if (options.runMigrations) {
      logSuccess('Migrations applied successfully!')
    }
    log('='.repeat(60))
    console.log('')
    logInfo('Local Supabase connection details:')
    console.log(`  URL: ${CONFIG.LOCAL_DB_URL}`)
    console.log(`  Port: ${CONFIG.LOCAL_DB_PORT}`)
    console.log('')
    logInfo('Useful commands:')
    console.log('  bun run db:local:status  - Check Supabase status')
    console.log('  bun run db:local:stop    - Stop local Supabase')
    console.log('')
    logInfo('Run dev server with local database:')
    console.log(`  DATABASE_URL="${CONFIG.LOCAL_DB_URL}" bun dev`)
    console.log('')

    if (options.inspect) {
      logInfo('Inspect mode: Containers will keep running')
      logInfo('Press Ctrl+C to exit when done inspecting')
      // Keep process alive
      await new Promise(() => {})
    }
  } catch (err) {
    logError(`Clone failed: ${err}`)
    process.exit(1)
  }
}

// Run
main().catch((err) => {
  logError(`Unexpected error: ${err}`)
  process.exit(1)
})
