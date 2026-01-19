#!/usr/bin/env bun
/**
 * pgcp - PostgreSQL Copy Tool
 *
 * Copies databases like `cp` copies files: `pgcp source destination`
 * Designed for npm packaging with minimal dependencies.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. Simple like `cp` - complexity of dumping/restoring is abstracted away
 * 2. Destination is always Docker - provides safety (can't overwrite prod),
 *    clean slate, isolation, and predictable lifecycle management
 *
 * v0 SCOPE
 * --------
 * - Source: Supabase databases only (auto-detected via URL hostname)
 * - Destination: Local Supabase via CLI (manages stop/start automatically)
 * - Platform: macOS only
 * - No config file, no data filtering, no incremental copies
 *
 * OPERATION SEQUENCE
 * ------------------
 * 1. Check prerequisites (Docker, Supabase CLI, psql)
 * 2. Stop existing local Supabase
 * 3. Start fresh local Supabase
 * 4. Wait for Postgres readiness
 * 5. Dump from source: roles -> schema -> data (optional)
 * 6. Restore to local: roles -> grant roles -> schema -> data (triggers disabled)
 * 7. Cleanup dump files (unless --keep-dumps)
 *
 * USAGE
 * -----
 *   pgcp <source> [port]
 *   pgcp env:STAGING_DATABASE_URL           # Use env var from .env/.env.local
 *   pgcp env:STAGING_DATABASE_URL 54400     # Custom port
 *   pgcp --schema-only env:PROD_DATABASE_URL
 *
 * FLAGS
 * -----
 *   --schema-only, -s    Copy schema only, skip data
 *   --keep-dumps, -k     Preserve dump files after completion
 *   --help, -h           Show help
 *
 * ENVIRONMENT
 * -----------
 * Automatically loads .env and .env.local from cwd.
 * Use env:VARNAME syntax to reference variables from these files.
 *
 * DEPENDENCIES
 * ------------
 * - Docker (running)
 * - Supabase CLI (`brew install supabase/tap/supabase`)
 * - psql (for role grants)
 */

import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

// ============================================================================
// Version
// ============================================================================

const VERSION = '0.1.0'

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  DUMP_DIR: '.pgcp-dumps',
  DEFAULT_DB_PORT: 54322,
  HEALTH_CHECK_RETRIES: 30,
  HEALTH_CHECK_INTERVAL_MS: 1000,
} as const

function getLocalDbUrl(port: number): string {
  return `postgresql://postgres:postgres@localhost:${port}/postgres`
}

// ============================================================================
// Types
// ============================================================================

interface PgcpOptions {
  sourceUrl: string
  port: number
  schemaOnly: boolean
  keepDumps: boolean
}

interface DumpResult {
  rolesFile: string
  schemaFile: string
  dataFile: string | null
}

type Provider = 'supabase'

// ============================================================================
// ANSI Colors and Formatting
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

const SYMBOLS = {
  check: '\u2714',
  cross: '\u2716',
  // Braille spinner frames
  spinner: [
    '\u280B',
    '\u2819',
    '\u2839',
    '\u2838',
    '\u283C',
    '\u2834',
    '\u2826',
    '\u2827',
    '\u2807',
    '\u280F',
  ],
  info: '\u2139',
  warning: '\u26A0',
}

// Bouncing dots animation - creates a wave effect where one dot "pops up"
// Using middle dot (·) as the raised position and period (.) as the base
const BOUNCING_DOTS = [
  '...',
  '...',
  '...',
  '...',
  '...',
  '...',
  '...',
  '\u00B7..',
  '.\u00B7.',
  '..\u00B7',
]

// ============================================================================
// Spinner Utility with Bouncing Dots
// ============================================================================

class Spinner {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private spinnerIndex = 0
  private dotsIndex = 0
  private baseMessage = ''

  start(message: string): void {
    // Remove trailing dots/ellipsis from message - we'll add our own
    this.baseMessage = message.replace(/\.+\s*$/, '').trim()
    this.spinnerIndex = 0
    this.dotsIndex = 0

    // Initial render
    this.render()

    // Animate at 80ms intervals
    this.intervalId = setInterval(() => {
      this.spinnerIndex =
        (this.spinnerIndex + 1) % SYMBOLS.spinner.length
      this.dotsIndex = (this.dotsIndex + 1) % BOUNCING_DOTS.length
      this.render()
    }, 80)
  }

  private render(): void {
    const spinner = SYMBOLS.spinner[this.spinnerIndex]
    const dots = BOUNCING_DOTS[this.dotsIndex]
    process.stdout.write(
      `\r\x1b[K${spinner} ${this.baseMessage} ${dots}`
    )
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    process.stdout.write('\r\x1b[K') // Clear line
  }

  success(message: string): void {
    this.stop()
    console.log(
      `${COLORS.green}${SYMBOLS.check}${COLORS.reset} ${message}`
    )
  }

  fail(message: string): void {
    this.stop()
    console.log(
      `${COLORS.red}${SYMBOLS.cross}${COLORS.reset} ${message}`
    )
  }
}

const spinner = new Spinner()

// ============================================================================
// Step Counter - tracks progress through operations
// ============================================================================

class StepCounter {
  private current = 0
  private total: number

  constructor(options: PgcpOptions) {
    // Calculate total steps based on options
    // Base steps: prereqs(1) + stop(1) + start(1) + wait(1) + dump roles(1) + dump schema(1)
    //           + restore roles(1) + grant roles(1) + restore schema(1) + cleanup(1) = 10
    let steps = 10
    if (!options.schemaOnly) {
      steps += 2 // dump data + restore data
    }
    if (options.keepDumps) {
      steps -= 1 // no cleanup step
    }
    this.total = steps
  }

  next(message: string): string {
    this.current++
    return `[${this.current}/${this.total}] ${message}`
  }

  getTotal(): number {
    return this.total
  }
}

// ============================================================================
// Logging Utilities
// ============================================================================

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

function logWarn(message: string): void {
  console.log(
    `${COLORS.yellow}${SYMBOLS.warning}${COLORS.reset} ${message}`
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
// Environment Loading
// ============================================================================

function parseEnvContent(
  content: string,
  env: Record<string, string>
): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        // Remove surrounding quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    }
  }
}

async function loadEnvFiles(): Promise<Record<string, string>> {
  const cwd = process.cwd()
  const env: Record<string, string> = {}

  // Load .env first
  const envFile = path.join(cwd, '.env')
  try {
    const content = await fs.readFile(envFile, 'utf-8')
    parseEnvContent(content, env)
  } catch {
    // .env file doesn't exist, continue
  }

  // Load .env.local (overrides .env)
  const envLocalFile = path.join(cwd, '.env.local')
  try {
    const content = await fs.readFile(envLocalFile, 'utf-8')
    parseEnvContent(content, env)
  } catch {
    // .env.local file doesn't exist, continue
  }

  return env
}

// ============================================================================
// Async Command Execution
// ============================================================================

const projectDir = process.cwd()

interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Run a command asynchronously, allowing the event loop to continue
 * (so spinners can animate while the command runs)
 */
function runCommandAsync(
  command: string,
  options: { silent?: boolean } = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: projectDir,
      stdio: options.silent ? 'pipe' : ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: code ?? 0,
      })
    })
  })
}

/**
 * Run a command that we expect to succeed, throw if it fails
 */
async function runCommand(
  command: string,
  options: { silent?: boolean } = {}
): Promise<string> {
  const result = await runCommandAsync(command, options)
  if (result.code !== 0) {
    throw new Error(
      result.stderr || `Command failed with code ${result.code}`
    )
  }
  return result.stdout
}

/**
 * Run a command quietly and check if it succeeds (for prerequisite checks)
 */
async function runCommandQuiet(command: string): Promise<string> {
  return runCommand(command, { silent: true })
}

/**
 * Check if a command succeeds without throwing
 */
async function commandSucceeds(command: string): Promise<boolean> {
  try {
    const result = await runCommandAsync(command, { silent: true })
    return result.code === 0
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Provider Detection
// ============================================================================

function detectProvider(url: string): Provider | null {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    // Supabase patterns
    if (
      hostname.endsWith('.supabase.co') ||
      hostname.endsWith('.supabase.com') ||
      hostname.includes('pooler.supabase')
    ) {
      return 'supabase'
    }

    return null
  } catch {
    return null
  }
}

function getMaskedUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//*****@${parsed.hostname}:${parsed.port}${parsed.pathname}`
  } catch {
    return '(invalid URL)'
  }
}

// ============================================================================
// Argument Parsing
// ============================================================================

function showHelp(): void {
  console.log(`
${COLORS.bold}pgcp${COLORS.reset} v${VERSION} - PostgreSQL Copy Tool

${COLORS.bold}USAGE${COLORS.reset}
  pgcp [options] <source> [port]

${COLORS.bold}ARGUMENTS${COLORS.reset}
  <source>    Source database URL or env:VARNAME to read from .env files
  [port]      Local Supabase port (default: ${CONFIG.DEFAULT_DB_PORT})

${COLORS.bold}OPTIONS${COLORS.reset}
  --schema-only, -s    Copy schema only, skip data
  --keep-dumps, -k     Keep dump files after completion
  --help, -h           Show this help message

${COLORS.bold}EXAMPLES${COLORS.reset}
  # Copy using env variable from .env.local
  pgcp env:STAGING_DATABASE_URL

  # Copy to a custom port
  pgcp env:STAGING_DATABASE_URL 54400

  # Copy schema only
  pgcp --schema-only env:PROD_DATABASE_URL

${COLORS.bold}ENVIRONMENT${COLORS.reset}
  Automatically loads .env and .env.local from current directory.
  Use the env:VARNAME syntax to reference variables from these files.

${COLORS.bold}PORT CONFIGURATION${COLORS.reset}
  If a port is specified, pgcp temporarily modifies supabase/config.toml
  to use that port, then restores the original config after starting.
  This allows running multiple local Supabase instances on different ports.

${COLORS.bold}NOTES${COLORS.reset}
  - v${VERSION} only supports Supabase as the source
  - Requires: Docker, Supabase CLI, psql
`)
}

function parseArgs(loadedEnv: Record<string, string>): PgcpOptions {
  const args = process.argv.slice(2)

  // Parse flags
  const schemaOnly =
    args.includes('--schema-only') || args.includes('-s')
  const keepDumps =
    args.includes('--keep-dumps') || args.includes('-k')

  // Get positional arguments (filter out flags)
  const positional = args.filter((arg) => !arg.startsWith('-'))

  if (positional.length < 1) {
    logError('Missing required argument: <source>')
    console.log('\nRun "pgcp --help" for usage information.')
    process.exit(1)
  }

  const [sourceArg, portArg] = positional

  // Resolve source URL
  let sourceUrl = sourceArg
  if (sourceArg.startsWith('env:')) {
    const varName = sourceArg.slice(4)
    const value = loadedEnv[varName] || process.env[varName]
    if (!value) {
      logError(`Environment variable "${varName}" is not set.`)
      logInfo(
        'Check that it exists in .env.local or is exported in your shell.'
      )
      process.exit(1)
    }
    sourceUrl = value
  }

  // Parse port (optional, defaults to CONFIG.DEFAULT_DB_PORT)
  let port: number = CONFIG.DEFAULT_DB_PORT
  if (portArg) {
    const parsed = parseInt(portArg, 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      logError(`Invalid port: ${portArg}`)
      logInfo('Port must be a number between 1 and 65535.')
      process.exit(1)
    }
    port = parsed
  }

  return {
    sourceUrl,
    port,
    schemaOnly,
    keepDumps,
  }
}

// ============================================================================
// Prerequisite Checks
// ============================================================================

async function checkPrerequisites(steps: StepCounter): Promise<void> {
  const stepMsg = steps.next('Checking prerequisites')
  spinner.start(stepMsg)

  // Check Docker
  if (!(await commandSucceeds('docker info 2>/dev/null'))) {
    spinner.fail(stepMsg)
    logError(
      'Docker is not running. Please start Docker and try again.'
    )
    process.exit(1)
  }

  // Check Supabase CLI
  if (!(await commandSucceeds('which supabase'))) {
    spinner.fail(stepMsg)
    logError('Supabase CLI is not installed.')
    logInfo('Install with: brew install supabase/tap/supabase')
    process.exit(1)
  }

  // Check psql
  if (!(await commandSucceeds('which psql'))) {
    spinner.fail(stepMsg)
    logError('psql is not installed.')
    logInfo(
      'Install with: brew install libpq && brew link --force libpq'
    )
    process.exit(1)
  }

  // Check supabase/config.toml exists
  const configPath = path.join(projectDir, 'supabase', 'config.toml')
  if (!(await commandSucceeds(`test -f "${configPath}"`))) {
    spinner.fail(stepMsg)
    logError('Supabase is not initialized in this project.')
    logInfo('Run: supabase init')
    process.exit(1)
  }

  spinner.success(
    stepMsg.replace('Checking prerequisites', 'Prerequisites OK')
  )
}

// ============================================================================
// Config.toml Port Management
// ============================================================================

const configPath = path.join(projectDir, 'supabase', 'config.toml')
const configBackupPath = path.join(
  projectDir,
  'supabase',
  'config.toml.pgcp-backup'
)

/**
 * Backup config.toml and modify the db port.
 * Returns true if modification was made (port differs from default).
 *
 * Parses TOML line-by-line to safely handle:
 * - Comments (lines starting with #)
 * - Section headers ([db], [api], etc.)
 * - Only modifies port within the [db] section
 */
async function modifyConfigPort(port: number): Promise<boolean> {
  if (port === CONFIG.DEFAULT_DB_PORT) {
    return false // No modification needed
  }

  // Read current config
  const content = await fs.readFile(configPath, 'utf-8')

  // Backup original
  await fs.writeFile(configBackupPath, content)

  // Parse line by line to safely modify the port in [db] section
  const lines = content.split('\n')
  let inDbSection = false
  let modified = false

  const newLines = lines.map((line) => {
    const trimmed = line.trim()

    // Check for section headers
    if (trimmed.startsWith('[')) {
      inDbSection = trimmed === '[db]'
      return line
    }

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      return line
    }

    // Only modify port when in [db] section
    if (inDbSection && trimmed.startsWith('port')) {
      const match = line.match(/^(\s*port\s*=\s*)\d+(.*)$/)
      if (match) {
        modified = true
        return `${match[1]}${port}${match[2]}`
      }
    }

    return line
  })

  if (!modified) {
    // Restore backup if we didn't actually modify anything
    await fs.unlink(configBackupPath)
    return false
  }

  await fs.writeFile(configPath, newLines.join('\n'))
  return true
}

/**
 * Restore the original config.toml from backup.
 */
async function restoreConfig(): Promise<void> {
  try {
    const backup = await fs.readFile(configBackupPath, 'utf-8')
    await fs.writeFile(configPath, backup)
    await fs.unlink(configBackupPath)
  } catch {
    // Backup might not exist if port wasn't modified
  }
}

// ============================================================================
// Supabase Local Management
// ============================================================================

async function prepareDestination(
  steps: StepCounter,
  port: number
): Promise<void> {
  // Stop existing Supabase
  let stepMsg = steps.next('Stopping existing Supabase containers')
  spinner.start(stepMsg)
  try {
    await runCommand('supabase stop --no-backup', { silent: true })
  } catch {
    // Ignore errors - containers might not be running
  }
  spinner.success(stepMsg.replace('Stopping', 'Stopped'))

  // Modify config.toml if using custom port
  if (port !== CONFIG.DEFAULT_DB_PORT) {
    configWasModified = await modifyConfigPort(port)
  }

  // Start fresh Supabase
  stepMsg = steps.next(
    `Starting fresh Supabase instance${port !== CONFIG.DEFAULT_DB_PORT ? ` on port ${port}` : ''}`
  )
  spinner.start(stepMsg)
  try {
    await runCommand('supabase start', { silent: true })
  } catch (err) {
    // Restore config on failure
    if (configWasModified) {
      await restoreConfig()
      configWasModified = false
    }
    spinner.fail(stepMsg.replace('Starting', 'Failed to start'))
    logError(`${err}`)
    process.exit(1)
  }
  spinner.success(stepMsg.replace('Starting', 'Started'))

  // Restore config.toml after starting (Supabase has already read it)
  if (configWasModified) {
    await restoreConfig()
    configWasModified = false
  }

  // Wait for Postgres to be ready
  stepMsg = steps.next('Waiting for Postgres to be ready')
  spinner.start(stepMsg)
  for (let i = 0; i < CONFIG.HEALTH_CHECK_RETRIES; i++) {
    if (
      await commandSucceeds(
        `psql "${getLocalDbUrl(port)}" -c "SELECT 1" 2>/dev/null`
      )
    ) {
      spinner.success(
        stepMsg.replace(
          'Waiting for Postgres to be ready',
          'Postgres is ready'
        )
      )
      return
    }
    await sleep(CONFIG.HEALTH_CHECK_INTERVAL_MS)
  }
  spinner.fail(stepMsg.replace('Waiting for', 'Failed:'))
  process.exit(1)
}

// ============================================================================
// Database Dump Operations
// ============================================================================

async function ensureDumpDir(): Promise<string> {
  const dumpDir = path.join(projectDir, CONFIG.DUMP_DIR)
  await fs.mkdir(dumpDir, { recursive: true })
  dumpDirCreated = true // Track for signal handler cleanup
  return dumpDir
}

async function dumpSourceDatabase(
  sourceUrl: string,
  options: PgcpOptions,
  steps: StepCounter
): Promise<DumpResult> {
  const dumpDir = await ensureDumpDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const prefix = `dump-${timestamp}`

  // Dump roles
  let stepMsg = steps.next('Dumping roles')
  spinner.start(stepMsg)
  const rolesFile = path.join(dumpDir, `${prefix}-roles.sql`)
  try {
    await runCommand(
      `supabase db dump --db-url "${sourceUrl}" --role-only -f "${rolesFile}"`,
      { silent: true }
    )
  } catch (err) {
    spinner.fail(stepMsg.replace('Dumping', 'Failed to dump'))
    throw err
  }
  spinner.success(stepMsg.replace('Dumping', 'Dumped'))

  // Dump schema
  stepMsg = steps.next('Dumping schema')
  spinner.start(stepMsg)
  const schemaFile = path.join(dumpDir, `${prefix}-schema.sql`)
  try {
    await runCommand(
      `supabase db dump --db-url "${sourceUrl}" -f "${schemaFile}"`,
      { silent: true }
    )
  } catch (err) {
    spinner.fail(stepMsg.replace('Dumping', 'Failed to dump'))
    throw err
  }
  spinner.success(stepMsg.replace('Dumping', 'Dumped'))

  let dataFile: string | null = null
  if (!options.schemaOnly) {
    stepMsg = steps.next('Dumping data (this may take a while)')
    spinner.start(stepMsg)
    dataFile = path.join(dumpDir, `${prefix}-data.sql`)
    try {
      await runCommand(
        `supabase db dump --db-url "${sourceUrl}" --data-only --use-copy -f "${dataFile}"`,
        { silent: true }
      )
    } catch (err) {
      spinner.fail(stepMsg.replace('Dumping', 'Failed to dump'))
      throw err
    }
    spinner.success(
      stepMsg.replace(
        'Dumping data (this may take a while)',
        'Dumped data'
      )
    )
  }

  return { rolesFile, schemaFile, dataFile }
}

// ============================================================================
// Database Restore Operations
// ============================================================================

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

async function grantRolesToPostgres(
  localDbUrl: string
): Promise<void> {
  const rolesQuery = `
    SELECT rolname FROM pg_roles
    WHERE rolname NOT LIKE 'pg_%'
    AND rolname != 'postgres'
    AND NOT rolsuper
  `.replace(/\n/g, ' ')

  try {
    const result = await runCommandQuiet(
      `psql "${localDbUrl}" -t -A -c "${rolesQuery}"`
    )

    const roles = result.split('\n').filter((r) => r.trim())
    for (const role of roles) {
      try {
        const quotedRole = quoteIdentifier(role)
        await runCommand(
          `psql "${localDbUrl}" -c "GRANT ${quotedRole} TO postgres;"`,
          { silent: true }
        )
      } catch {
        // Role might already be granted or have issues - continue
      }
    }
  } catch {
    // Ignore errors during role grant
  }
}

async function restoreToLocal(
  dumpResult: DumpResult,
  steps: StepCounter,
  port: number
): Promise<void> {
  const localDbUrl = getLocalDbUrl(port)
  const { rolesFile, schemaFile, dataFile } = dumpResult

  // Restore roles
  let stepMsg = steps.next('Restoring roles')
  spinner.start(stepMsg)
  try {
    await runCommand(`psql "${localDbUrl}" -f "${rolesFile}"`, {
      silent: true,
    })
  } catch (err) {
    spinner.fail(stepMsg.replace('Restoring', 'Failed to restore'))
    throw err
  }
  spinner.success(stepMsg.replace('Restoring', 'Restored'))

  // Grant roles to postgres
  stepMsg = steps.next('Granting roles to postgres')
  spinner.start(stepMsg)
  await grantRolesToPostgres(localDbUrl)
  spinner.success(stepMsg.replace('Granting', 'Granted'))

  // Restore schema
  stepMsg = steps.next('Restoring schema')
  spinner.start(stepMsg)
  try {
    await runCommand(
      `psql "${localDbUrl}" -v ON_ERROR_STOP=1 -f "${schemaFile}"`,
      { silent: true }
    )
  } catch (err) {
    spinner.fail(stepMsg.replace('Restoring', 'Failed to restore'))
    throw err
  }
  spinner.success(stepMsg.replace('Restoring', 'Restored'))

  // Restore data
  if (dataFile) {
    stepMsg = steps.next('Restoring data (triggers disabled)')
    spinner.start(stepMsg)
    try {
      await runCommand(
        `psql "${localDbUrl}" -c "SET session_replication_role = replica;" -f "${dataFile}" -c "SET session_replication_role = DEFAULT;"`,
        { silent: true }
      )
    } catch (err) {
      spinner.fail(stepMsg.replace('Restoring', 'Failed to restore'))
      throw err
    }
    spinner.success(
      stepMsg.replace(
        'Restoring data (triggers disabled)',
        'Restored data'
      )
    )
  }
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Global state for signal handler cleanup.
 */
let dumpDirCreated = false
let configWasModified = false
let keepDumpsOption = false

/**
 * Delete the entire dump directory and all its contents.
 * Returns the number of files deleted.
 */
async function cleanupDumpDir(): Promise<number> {
  const dumpDir = path.join(projectDir, CONFIG.DUMP_DIR)
  let count = 0

  try {
    const entries = await fs.readdir(dumpDir)
    // Delete all files in the directory
    for (const entry of entries) {
      try {
        await fs.unlink(path.join(dumpDir, entry))
        // Only count non-hidden files (like .DS_Store)
        if (!entry.startsWith('.')) {
          count++
        }
      } catch {
        // Ignore errors
      }
    }
    // Remove the now-empty directory
    await fs.rmdir(dumpDir)
  } catch {
    // Directory might not exist or other error - ignore
  }

  return count
}

/**
 * Handle interrupt signals (SIGINT from Ctrl+C, SIGTERM).
 * Cleans up dump files and restores config.toml before exiting.
 */
async function handleInterrupt(signal: string): Promise<void> {
  // Stop any running spinner
  spinner.stop()

  console.log('')
  logWarn(`Received ${signal}, cleaning up...`)

  // Restore config.toml if it was modified
  if (configWasModified) {
    try {
      await restoreConfig()
      logDim('Restored config.toml')
    } catch {
      // Best effort
    }
  }

  // Clean up dump directory if it was created and user didn't request to keep dumps
  if (dumpDirCreated && !keepDumpsOption) {
    const count = await cleanupDumpDir()
    if (count > 0) {
      logDim(`Removed ${count} dump file(s)`)
    }
  }

  console.log('')
  process.exit(130) // Standard exit code for SIGINT
}

function setupSignalHandlers(): void {
  process.on('SIGINT', () => {
    handleInterrupt('SIGINT').catch(() => process.exit(130))
  })
  process.on('SIGTERM', () => {
    handleInterrupt('SIGTERM').catch(() => process.exit(143))
  })
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  // Check for help flag early (before printing header)
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  // Setup signal handlers early for cleanup on Ctrl+C
  setupSignalHandlers()

  console.log('')
  console.log(
    `${COLORS.bold}pgcp${COLORS.reset} v${VERSION} - PostgreSQL Copy Tool`
  )
  console.log('')

  // Load environment files
  const loadedEnv = await loadEnvFiles()
  const envFilesLoaded = Object.keys(loadedEnv).length > 0

  // Parse arguments
  const options = parseArgs(loadedEnv)

  // Store keepDumps option for signal handler
  keepDumpsOption = options.keepDumps

  // Detect and validate provider
  const provider = detectProvider(options.sourceUrl)
  if (!provider) {
    logError('Source URL does not appear to be a Supabase database.')
    logInfo(`pgcp v${VERSION} only supports Supabase sources.`)
    logInfo('')
    logInfo(`Detected URL: ${getMaskedUrl(options.sourceUrl)}`)
    logInfo('')
    logInfo(
      'If this IS a Supabase database, please report this issue.'
    )
    process.exit(1)
  }

  // Show configuration
  if (envFilesLoaded) {
    logSuccess('Loaded environment from .env/.env.local')
  }
  logInfo(`Source: ${getMaskedUrl(options.sourceUrl)} (${provider})`)
  logInfo(`Destination: localhost:${options.port} (local supabase)`)
  if (options.schemaOnly) {
    logInfo('Mode: Schema only (no data)')
  }
  console.log('')

  // Create step counter
  const steps = new StepCounter(options)

  let dumpResult: DumpResult | null = null

  try {
    // Check prerequisites
    await checkPrerequisites(steps)

    // Prepare destination (stop/start Supabase)
    await prepareDestination(steps, options.port)

    // Dump source database
    dumpResult = await dumpSourceDatabase(
      options.sourceUrl,
      options,
      steps
    )

    // Restore to local
    await restoreToLocal(dumpResult, steps, options.port)

    // Cleanup
    if (!options.keepDumps) {
      const stepMsg = steps.next('Cleaning up dump files')
      spinner.start(stepMsg)
      const count = await cleanupDumpDir()
      dumpDirCreated = false // Prevent signal handler double-cleanup
      spinner.success(
        stepMsg.replace('Cleaning up', `Removed ${count}`)
      )
    } else {
      logInfo(`Dump files preserved in: ${CONFIG.DUMP_DIR}`)
    }

    // Success!
    console.log('')
    logSuccess('Copy complete!')
    console.log('')
    logInfo(`Destination: ${getLocalDbUrl(options.port)}`)
    console.log('')
  } catch (err) {
    // Clean up on failure
    if (dumpDirCreated && !options.keepDumps) {
      const count = await cleanupDumpDir()
      dumpDirCreated = false
      if (count > 0) {
        console.log('')
        logDim(`Cleaned up ${count} dump file(s).`)
      }
    }

    console.log('')
    logError(`Copy failed: ${err}`)
    console.log('')
    logInfo('Hints:')
    logInfo('  - Check that your source URL is correct')
    logInfo('  - Ensure the database allows connections from your IP')
    logInfo('  - Verify Docker is running')
    process.exit(1)
  }
}

// Run
main().catch((err) => {
  logError(`Unexpected error: ${err}`)
  process.exit(1)
})
