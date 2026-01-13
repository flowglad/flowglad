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
import * as readline from 'readline'

const TEST_CONTAINER_PREFIX = 'flowglad-migration-test'
const TEST_PORT_STAGING = 5433
const TEST_PORT_PROD = 5434
const POSTGRES_IMAGE = 'postgres:15'

interface TestResult {
  environment: 'staging' | 'production'
  success: boolean
  error?: string
  durationMs: number
  port?: number
  containerName?: string
}

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close()
      resolve()
    })
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
    const execError = error as { stderr?: string; stdout?: string }
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
    const execError = error as {
      stderr?: string
      stdout?: string
      message?: string
      status?: number
    }

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

function runMigrations(targetPort: number): void {
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

  // Run the migrate script with the test database URL
  execSync(
    `DATABASE_URL="${testDbUrl}" bun run src/scripts/migrate.ts`,
    {
      encoding: 'utf-8',
      stdio: 'inherit',
      cwd: process.cwd(),
    }
  )

  log('Migrations applied successfully', 'success')
}

async function testMigration(
  environment: 'staging' | 'production',
  databaseUrl: string,
  port: number,
  options: { inspect?: boolean } = {}
): Promise<TestResult> {
  const containerName = `${TEST_CONTAINER_PREFIX}-${environment}`
  const startTime = Date.now()

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

    // 4. Run migrations
    runMigrations(port)

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
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startTime

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
  const args = process.argv.slice(2)
  const stagingOnly = args.includes('--staging')
  const prodOnly = args.includes('--prod')
  const inspect = args.includes('--inspect')

  console.log('\n')
  log('🧪 Migration Test Script')
  log('Testing pending migrations against database clones\n')

  if (inspect) {
    log(
      'Inspect mode enabled - containers will be kept running',
      'warn'
    )
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
        TEST_PORT_PROD,
        { inspect }
      )
      results.push(prodResult)
    } else if (stagingOnly) {
      // Test staging only
      const stagingResult = await testMigration(
        'staging',
        dbUrls.staging,
        TEST_PORT_STAGING,
        { inspect }
      )
      results.push(stagingResult)
    } else {
      // Test staging first, then production if staging passes
      const stagingResult = await testMigration(
        'staging',
        dbUrls.staging,
        TEST_PORT_STAGING,
        { inspect }
      )
      results.push(stagingResult)

      if (stagingResult.success) {
        const prodResult = await testMigration(
          'production',
          dbUrls.prod,
          TEST_PORT_PROD,
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

      console.log('\n')
      await waitForEnter(
        'Press Enter to clean up containers and exit...'
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
