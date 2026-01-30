/**
 * Migration Test Script
 *
 * This script tests pending database migrations against clones of staging and production databases.
 * It creates a fresh Docker container with a PostgreSQL instance, clones the target database
 * using pg_dump, then runs pending migrations to verify they apply successfully.
 *
 * Usage:
 *   bun run migrations:test              # Test against staging, then prod (if staging passes)
 *   bun run migrations:test --staging    # Test against staging only
 *   bun run migrations:test --prod       # Test against prod only (use with caution)
 *   bun run migrations:test --inspect    # Keep containers running for inspection after tests
 *
 * Note if bun run migrations:test command is not present,
 * use `bun run src/scripts/test-migrations.ts {--flags}`
 * eg. `bun run src/scripts/test-migrations.ts --prod --inspect --port=5435`
 *
 * Port Options:
 *   --port=<port>   Custom port for the test container. Must be used with --staging or --prod.
 *                   Useful when the default port (5433 for staging, 5434 for prod) is already in use.
 *                   Examples:
 *                     bun run migrations:test --staging --port=5440
 *                     bun run migrations:test --prod --port=5450
 *                     bun run migrations:test --staging --inspect --port=5440
 *
 * Interactive Features (--inspect mode):
 *   - Press 'e' to export all migration output (including PostgreSQL NOTICE messages) to a timestamped log file
 *   - Press 'm' to re-run migrations without doing pg_dump again (useful for quickly running migrations again on the same pre-migration DB state after updating migration SQL files)
 *   - Press Enter to clean up containers and exit
 *   The containers remain running after export/re-run, allowing multiple iterations.
 *
 * Requirements:
 *   - Docker must be running
 *   - pg_dump and psql must be available (usually comes with PostgreSQL installation)
 *   - Environment variables STAGING_DATABASE_URL and PROD_DATABASE_URL must be set
 *     (or the script will attempt to pull them from Vercel)
 *   - Get connection string from supabase project > connect
 *     > connection string > type: URI, soure: Primary Database > method: Session pooler > view parameters
 *     It should have format: postgresql://[user]:[password]@[host]:5432/[database]
 */

import { loadEnvConfig } from '@next/env'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as readline from 'readline'
import { parseArgs } from 'util'

const TEST_CONTAINER_PREFIX = 'flowglad-migration-test'
const DEFAULT_PORT_STAGING = 5433
const DEFAULT_PORT_PROD = 5434
const POSTGRES_IMAGE = 'postgres:15'

/**
 * Parses and validates the port argument.
 * @returns The parsed port number, or undefined if not provided
 */
function validatePort(
  portStr: string | undefined
): number | undefined {
  if (!portStr) return undefined
  const port = Number.parseInt(portStr, 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid port number: ${portStr}. Must be between 1 and 65535.`
    )
  }
  return port
}

const { values: cliArgs } = parseArgs({
  args: process.argv.slice(2),
  options: {
    staging: { type: 'boolean', default: false },
    prod: { type: 'boolean', default: false },
    inspect: { type: 'boolean', default: false },
    port: { type: 'string' },
  },
  strict: true,
})

interface TestResult {
  environment: 'staging' | 'production'
  success: boolean
  error?: string
  durationMs: number
  port?: number
  containerName?: string
  migrationOutput?: string
}

interface ExecSyncError extends Error {
  stderr?: string
  stdout?: string
  status?: number
}

function getExecErrorOutput(error: unknown): string {
  const execError = error as ExecSyncError
  return execError.stdout || execError.stderr || ''
}

async function checkMigrationState(port: number): Promise<string> {
  try {
    const result = execSync(
      `psql "postgresql://test:test@localhost:${port}/test_db" -t -c "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 10"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    )
    return result.trim()
  } catch (error) {
    return 'Unable to fetch migration state'
  }
}

async function getMigrationCount(port: number): Promise<number> {
  try {
    const result = execSync(
      `psql "postgresql://test:test@localhost:${port}/test_db" -t -c "SELECT COUNT(*) FROM drizzle.__drizzle_migrations"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    )
    return Number.parseInt(result.trim(), 10)
  } catch (error) {
    return 0
  }
}

async function waitForUserAction(
  prompt: string,
  migrationOutput: string | undefined,
  port: number,
  onRerunMigrations: () => Promise<{
    output: string
    success: boolean
  }>
): Promise<void> {
  // Enable raw mode to capture single key presses
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  const showPrompt = () => {
    console.log('\n' + prompt)
    log(
      'Press \x1b[1me\x1b[0m to export, \x1b[1mm\x1b[0m to re-run migrations, or \x1b[1mEnter\x1b[0m to cleanup and exit',
      'info'
    )
  }

  return new Promise((resolve) => {
    showPrompt()

    const onData = async (key: string) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        process.stdin.pause()
        process.exit(0)
      }

      // Handle 'e' key - export to file
      if (key === 'e' || key === 'E') {
        if (migrationOutput) {
          const timestamp = new Date()
            .toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '')
          const filename = `migration-output-${timestamp}.log`

          try {
            fs.writeFileSync(filename, migrationOutput, 'utf-8')
            log(
              `Migration output exported to: ${filename}`,
              'success'
            )
          } catch (error) {
            log(
              `Failed to export: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            )
          }
        } else {
          log('No migration output to export', 'warn')
        }
        showPrompt()
        return
      }

      // Handle 'm' key - re-run migrations
      if (key === 'm' || key === 'M') {
        console.log('\n')
        log('Checking current migration state...', 'info')

        const beforeCount = await getMigrationCount(port)
        const beforeState = await checkMigrationState(port)

        log(`Currently applied migrations: ${beforeCount}`, 'info')
        if (
          beforeState &&
          beforeState !== 'Unable to fetch migration state'
        ) {
          log('Last 10 migrations:', 'info')
          console.log(beforeState)
        }

        log(
          '\nRe-running migrations (only pending will be applied)...',
          'warn'
        )

        try {
          const result = await onRerunMigrations()
          migrationOutput = result.output // Update with new output

          const afterCount = await getMigrationCount(port)
          const newMigrations = afterCount - beforeCount

          if (result.success) {
            log(
              `Migrations completed successfully! Applied ${newMigrations} new migration(s)`,
              'success'
            )
          } else {
            log('Migrations failed again', 'error')
          }
        } catch (error) {
          log(
            `Migration error: ${error instanceof Error ? error.message : String(error)}`,
            'error'
          )
        }

        showPrompt()
        return
      }

      // Handle Enter key - cleanup and exit
      if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onData)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        process.stdin.pause()
        console.log('') // New line for cleaner output
        resolve()
      }

      // All other keys are ignored - continue waiting for 'e' or Enter
    }

    process.stdin.on('data', onData)
  })
}

function log(
  message: string,
  level: 'info' | 'error' | 'success' | 'warn' = 'info'
) {
  const prefix = {
    info: '\x1b[36mℹ\x1b[0m',
    error: '\x1b[31m✖\x1b[0m',
    success: '\x1b[32m✔\x1b[0m',
    warn: '\x1b[33m⚠\x1b[0m',
  }
  console.log(`${prefix[level]} ${message}`)
}

function execCommand(
  command: string,
  options?: { silent?: boolean }
): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options?.silent ? 'pipe' : 'inherit',
    })
  } catch (error) {
    if (options?.silent) {
      return ''
    }
    throw error
  }
}

function execCommandWithOutput(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  } catch (error) {
    const execError = error as ExecSyncError
    throw new Error(
      execError.stderr || execError.stdout || 'Command failed'
    )
  }
}

async function waitForPostgres(
  port: number,
  maxAttempts = 30
): Promise<void> {
  log(`Waiting for PostgreSQL to be ready on port ${port}...`)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execCommandWithOutput(
        `pg_isready -h localhost -p ${port} -U test 2>/dev/null`
      )
      log(`PostgreSQL is ready on port ${port}`, 'success')
      return
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `PostgreSQL not ready after ${maxAttempts} attempts`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

function cleanupContainer(containerName: string): void {
  log(`Cleaning up container: ${containerName}`)
  execCommand(`docker rm -f ${containerName} 2>/dev/null || true`, {
    silent: true,
  })
}

function startPostgresContainer(
  containerName: string,
  port: number
): void {
  log(
    `Starting PostgreSQL container: ${containerName} on port ${port}`
  )

  // Remove existing container if it exists
  cleanupContainer(containerName)

  execCommand(
    `docker run -d --name ${containerName} \
      -e POSTGRES_PASSWORD=test \
      -e POSTGRES_USER=test \
      -e POSTGRES_DB=test_db \
      -p ${port}:5432 \
      ${POSTGRES_IMAGE}`,
    { silent: true }
  )
}

function cloneDatabase(sourceUrl: string, targetPort: number): void {
  log(
    'Cloning database (this may take a while for large databases)...'
  )

  // Parse the source URL to extract connection info for logging (without password)
  const urlMatch = sourceUrl.match(/@([^:]+):(\d+)\/(.+)$/)
  if (urlMatch) {
    log(`  Source: ${urlMatch[1]}:${urlMatch[2]}/${urlMatch[3]}`)
  }
  log(`  Target: localhost:${targetPort}/test_db`)

  // Ensure sslmode is set for Supabase connections
  const sourceUrlWithSsl = sourceUrl.includes('sslmode=')
    ? sourceUrl
    : sourceUrl.includes('?')
      ? `${sourceUrl}&sslmode=require`
      : `${sourceUrl}?sslmode=require`

  // Use pg_dump to dump the source database and pipe to psql to restore
  // We use --no-owner and --no-acl to avoid permission issues
  // We use --clean to drop existing objects before recreating
  const dumpCommand = `pg_dump "${sourceUrlWithSsl}" --no-owner --no-acl --clean --if-exists`
  const restoreCommand = `psql "postgresql://test:test@localhost:${targetPort}/test_db"`

  log('  Running pg_dump...')

  try {
    const result = execSync(`${dumpCommand} | ${restoreCommand}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
    })
    log('Database cloned successfully', 'success')
  } catch (error) {
    const execError = error as ExecSyncError

    // Log detailed error info for debugging
    if (execError.stderr) {
      log(
        `  pg_dump stderr: ${execError.stderr.slice(0, 500)}`,
        'warn'
      )
    }
    if (execError.stdout) {
      log(
        `  pg_dump stdout: ${execError.stdout.slice(0, 500)}`,
        'info'
      )
    }

    // pg_dump/psql may output warnings to stderr even on success
    // Check if there's an actual fatal error
    if (
      execError.stderr &&
      (execError.stderr.includes('FATAL') ||
        execError.stderr.includes('could not connect') ||
        execError.stderr.includes('password authentication failed') ||
        execError.stderr.includes('no pg_hba.conf entry'))
    ) {
      throw new Error(`Database clone failed: ${execError.stderr}`)
    }

    // If pg_dump completely failed (exit code), throw
    if (execError.status && execError.status !== 0) {
      throw new Error(
        `Database clone failed with exit code ${execError.status}: ${execError.message}`
      )
    }

    log('Database cloned (with warnings)', 'warn')
  }

  // Verify data was actually copied by checking table count
  try {
    const tableCount = execSync(
      `psql "postgresql://test:test@localhost:${targetPort}/test_db" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim()
    log(`  Tables in cloned database: ${tableCount}`, 'info')

    if (Number.parseInt(tableCount, 10) === 0) {
      throw new Error(
        'Database clone appears to have failed - no tables found in public schema. ' +
          'Check your STAGING_DATABASE_URL or PROD_DATABASE_URL connection string.'
      )
    }
  } catch (verifyError) {
    if (
      verifyError instanceof Error &&
      verifyError.message.includes('no tables found')
    ) {
      throw verifyError
    }
    log('Could not verify table count', 'warn')
  }
}

function runMigrations(targetPort: number): string {
  log('Running pending migrations...')

  /**
   * We append options='-c session_replication_role=replica' to the DATABASE_URL.
   *
   * WHY: Supabase databases often have triggers that depend on Supabase-specific
   * extensions like pg_net (for webhooks/HTTP requests), supabase_realtime, etc.
   * These extensions don't exist in our local Docker PostgreSQL container.
   *
   * When migrations run DML statements (INSERT/UPDATE/DELETE), these triggers fire
   * and fail with errors like "schema 'net' does not exist".
   *
   * Setting session_replication_role to 'replica' disables all user-defined triggers,
   * allowing migrations to run without hitting missing extension errors.
   *
   * This is safe for migration testing because:
   * 1. We're testing schema changes and data transformations, not trigger behavior
   * 2. Triggers will still run correctly on the real Supabase database
   * 3. The cloned database is disposable - we delete it after testing
   */
  const testDbUrl = `postgresql://test:test@localhost:${targetPort}/test_db?options=-c%20session_replication_role%3Dreplica`

  log(
    'Triggers disabled via session_replication_role=replica',
    'info'
  )

  // Run the migrate script and capture output
  // We use pipe to capture but then display it so we can save it later
  try {
    const result = execSync(
      `DATABASE_URL="${testDbUrl}" bun run src/scripts/migrate.ts 2>&1`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer for large output
      }
    )

    // Display the captured output
    console.log(result)

    log('Migrations applied successfully', 'success')
    return result
  } catch (error) {
    const fullOutput = getExecErrorOutput(error)

    // Display the error output
    if (fullOutput) {
      console.log(fullOutput)
    }

    // Re-throw to maintain error handling
    throw error
  }
}

async function testMigration(
  environment: 'staging' | 'production',
  databaseUrl: string,
  port: number,
  options: { inspect?: boolean } = {}
): Promise<TestResult> {
  const containerName = `${TEST_CONTAINER_PREFIX}-${environment}`
  const startTime = Date.now()
  let migrationOutput = ''

  log(`\n${'='.repeat(60)}`)
  log(
    `Testing migrations against ${environment.toUpperCase()} database`
  )
  log(`${'='.repeat(60)}\n`)

  try {
    // 1. Start PostgreSQL container
    startPostgresContainer(containerName, port)

    // 2. Wait for PostgreSQL to be ready
    await waitForPostgres(port)

    // 3. Clone the database
    cloneDatabase(databaseUrl, port)

    // 4. Run migrations and capture output
    migrationOutput = runMigrations(port)

    const durationMs = Date.now() - startTime
    log(
      `\n${environment.toUpperCase()} migration test passed in ${(durationMs / 1000).toFixed(1)}s`,
      'success'
    )

    return {
      environment,
      success: true,
      durationMs,
      port,
      containerName,
      migrationOutput,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startTime

    // Capture error output too
    const execError = error as ExecSyncError
    if (execError.stdout || execError.stderr) {
      migrationOutput = `STDOUT:\n${execError.stdout || ''}\n\nSTDERR:\n${execError.stderr || ''}`
    }

    log(
      `\n${environment.toUpperCase()} migration test FAILED: ${errorMessage}`,
      'error'
    )

    return {
      environment,
      success: false,
      error: errorMessage,
      durationMs,
      port,
      containerName,
      migrationOutput,
    }
  } finally {
    // Only cleanup if not in inspect mode
    if (!options.inspect) {
      cleanupContainer(containerName)
    }
  }
}

function checkPrerequisites(): void {
  log('Checking prerequisites...')

  // Check Docker
  try {
    execCommandWithOutput('docker info 2>/dev/null')
    log('Docker is running', 'success')
  } catch {
    throw new Error(
      'Docker is not running. Please start Docker and try again.'
    )
  }

  // Check pg_dump
  try {
    execCommandWithOutput('which pg_dump')
    log('pg_dump is available', 'success')
  } catch {
    throw new Error(
      'pg_dump is not installed. Please install PostgreSQL client tools.\n' +
        '  macOS: brew install libpq && brew link --force libpq\n' +
        '  Ubuntu: sudo apt-get install postgresql-client'
    )
  }

  // Check psql
  try {
    execCommandWithOutput('which psql')
    log('psql is available', 'success')
  } catch {
    throw new Error(
      'psql is not installed. Please install PostgreSQL client tools.'
    )
  }
}

function getDatabaseUrls(): { staging: string; prod: string } {
  // Load environment variables
  loadEnvConfig(process.cwd())

  const staging = process.env.STAGING_DATABASE_URL
  const prod = process.env.PROD_DATABASE_URL

  if (!staging) {
    throw new Error(
      'STAGING_DATABASE_URL is not set.\n' +
        'Please set it in your environment or .env.local file.\n' +
        'You can find it in your Supabase dashboard under Settings > Database > Connection string.'
    )
  }

  if (!prod) {
    throw new Error(
      'PROD_DATABASE_URL is not set.\n' +
        'Please set it in your environment or .env.local file.\n' +
        'You can find it in your Supabase dashboard under Settings > Database > Connection string.'
    )
  }

  return { staging, prod }
}

async function main(): Promise<void> {
  const stagingOnly = cliArgs.staging
  const prodOnly = cliArgs.prod
  const inspect = cliArgs.inspect

  // Parse custom port if provided
  const customPort = validatePort(cliArgs.port)

  // Validate --port usage: must be used with --staging or --prod (single environment)
  if (customPort && !stagingOnly && !prodOnly) {
    throw new Error(
      '--port can only be used with --staging or --prod flag.\n' +
        'When running both environments, default ports are used (staging: 5433, prod: 5434).'
    )
  }

  // Determine ports for each environment
  const testPortStaging =
    stagingOnly && customPort ? customPort : DEFAULT_PORT_STAGING
  const testPortProd =
    prodOnly && customPort ? customPort : DEFAULT_PORT_PROD

  console.log('\n')
  log('🧪 Migration Test Script')
  log('Testing pending migrations against database clones\n')

  if (inspect) {
    log(
      'Inspect mode enabled - containers will be kept running',
      'warn'
    )
  }

  if (customPort) {
    const env = stagingOnly ? 'staging' : 'prod'
    log(`Using custom port for ${env}: ${customPort}`, 'info')
  }

  try {
    // Check prerequisites
    checkPrerequisites()

    // Get database URLs
    const dbUrls = getDatabaseUrls()

    const results: TestResult[] = []

    if (prodOnly) {
      // Test production only
      log('\nRunning production-only test (--prod flag)', 'warn')
      const prodResult = await testMigration(
        'production',
        dbUrls.prod,
        testPortProd,
        { inspect }
      )
      results.push(prodResult)
    } else if (stagingOnly) {
      // Test staging only
      const stagingResult = await testMigration(
        'staging',
        dbUrls.staging,
        testPortStaging,
        { inspect }
      )
      results.push(stagingResult)
    } else {
      // Test staging first, then production if staging passes
      const stagingResult = await testMigration(
        'staging',
        dbUrls.staging,
        testPortStaging,
        { inspect }
      )
      results.push(stagingResult)

      if (stagingResult.success) {
        const prodResult = await testMigration(
          'production',
          dbUrls.prod,
          testPortProd,
          { inspect }
        )
        results.push(prodResult)
      } else {
        log(
          '\nSkipping production test because staging failed',
          'warn'
        )
      }
    }

    // Print summary
    console.log('\n')
    log('='.repeat(60))
    log('MIGRATION TEST SUMMARY')
    log('='.repeat(60))

    for (const result of results) {
      const status = result.success
        ? '\x1b[32mPASSED\x1b[0m'
        : '\x1b[31mFAILED\x1b[0m'
      const duration = `${(result.durationMs / 1000).toFixed(1)}s`
      log(
        `  ${result.environment.padEnd(12)} ${status} (${duration})`
      )
      if (result.error) {
        log(`    Error: ${result.error}`, 'error')
      }
    }

    console.log('\n')

    // If inspect mode, show connection strings and wait for user input before cleanup
    if (inspect) {
      log('='.repeat(60))
      log('DATABASE INSPECTION')
      log('='.repeat(60))
      log('\nContainers are still running. Connect using:')

      for (const result of results) {
        if (result.port && result.containerName) {
          const connString = `postgresql://test:test@localhost:${result.port}/test_db`
          log(`\n  ${result.environment.toUpperCase()}:`)
          log(`    Connection: ${connString}`)
          log(`    Container:  ${result.containerName}`)
          log(`    Example:    psql "${connString}"`)
        }
      }

      // Combine all migration outputs
      let allOutput = results
        .map((r) => {
          return `\n${'='.repeat(60)}\n${r.environment.toUpperCase()} MIGRATION OUTPUT\n${'='.repeat(60)}\n${r.migrationOutput || 'No output captured'}`
        })
        .join('\n\n')

      // Create a function to re-run migrations for the relevant results
      const rerunMigrations = async () => {
        const rerunResults: { output: string; success: boolean }[] =
          []

        for (const result of results) {
          if (result.port) {
            try {
              const output = runMigrations(result.port)
              rerunResults.push({ output, success: true })

              // Update the result's migration output
              result.migrationOutput = output
            } catch (error) {
              const output = getExecErrorOutput(error)
              rerunResults.push({ output, success: false })

              result.migrationOutput = output
            }
          }
        }

        // Combine all outputs
        allOutput = results
          .map((r) => {
            return `\n${'='.repeat(60)}\n${r.environment.toUpperCase()} MIGRATION OUTPUT\n${'='.repeat(60)}\n${r.migrationOutput || 'No output captured'}`
          })
          .join('\n\n')

        return {
          output: allOutput,
          success: rerunResults.every((r) => r.success),
        }
      }

      // Use the first result's port for migration state checks
      const primaryPort = results[0]?.port || DEFAULT_PORT_STAGING

      console.log('\n')
      await waitForUserAction(
        'Press Enter to clean up containers and exit...',
        allOutput,
        primaryPort,
        rerunMigrations
      )

      // Clean up containers
      log('\nCleaning up containers...')
      for (const result of results) {
        if (result.containerName) {
          cleanupContainer(result.containerName)
        }
      }
    }

    // Exit with appropriate code
    const allPassed = results.every((r) => r.success)
    if (allPassed) {
      log(
        'All migration tests passed! Safe to apply to real databases.',
        'success'
      )
      process.exit(0)
    } else {
      log(
        'Some migration tests failed. Do NOT apply these migrations until fixed.',
        'error'
      )
      process.exit(1)
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    log(`\nFatal error: ${errorMessage}`, 'error')
    process.exit(1)
  }
}

main()
