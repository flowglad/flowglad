/**
 * Initialize a playground project for local development.
 *
 * This script sets up everything needed to run a playground against the local Flowglad platform:
 * 1. Copies staging schema to local Supabase (via dbCopy)
 * 2. Seeds the platform database with a user, org, pricing model, and API key
 * 3. Generates the playground's .env.local with all required environment variables
 * 4. Sets up the playground's local database (Docker + migrations)
 * 5. Starts all services (platform, playground, trigger.dev) in background
 *
 * Usage:
 *   bun run init:playground seat-based-billing
 *   bun run init:playground generation-based-subscription
 *   bun run init:playground seat-based-billing --no-dev  # Setup only, don't start services
 *
 * Prerequisites:
 *   - Docker must be running
 *   - Local Supabase will be started automatically if not running
 */

import { execSync, type SpawnOptions, spawn } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Configuration
// ============================================================================

// From src/scripts -> src -> flowglad-next -> platform -> repo root
const REPO_ROOT = path.resolve(__dirname, '../../../..')
// From src/scripts -> src -> flowglad-next
const PLATFORM_DIR = path.resolve(__dirname, '../..')
const PLAYGROUND_DIR = path.join(REPO_ROOT, 'playground')
const LOGS_DIR = path.join(REPO_ROOT, '.playground-logs')
const PIDS_FILE = path.join(LOGS_DIR, '.pids.json')

const AVAILABLE_PLAYGROUNDS = [
  'seat-based-billing',
  'generation-based-subscription',
]

// Platform user credentials (must match seedPlayground.ts)
const PLATFORM_USER = {
  email: 'dev@flowglad.local',
  password: 'flowglad123',
}

// Playground database configuration
const PLAYGROUND_DB = {
  'seat-based-billing': {
    port: 5433,
    databaseUrl:
      'postgresql://flowglad:flowglad_dev_password@localhost:5433/flowglad_db',
  },
  'generation-based-subscription': {
    port: 5434,
    databaseUrl:
      'postgresql://flowglad:flowglad_dev_password@localhost:5434/flowglad_db',
  },
}

// ============================================================================
// ANSI Colors
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
  info: '\u2139',
  arrow: '\u279c',
  bullet: '\u2022',
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

function logStep(step: number, total: number, message: string): void {
  console.log(
    `\n${COLORS.blue}[${step}/${total}]${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset}`
  )
}

function logDim(message: string): void {
  console.log(`${COLORS.dim}${message}${COLORS.reset}`)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random base64 string for BETTER_AUTH_SECRET.
 */
function generateSecret(): string {
  return crypto.randomBytes(32).toString('base64')
}

/**
 * Run a command and return stdout.
 */
function runCommand(
  command: string,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): string {
  return execSync(command, {
    encoding: 'utf-8',
    cwd: options?.cwd ?? PLATFORM_DIR,
    env: { ...process.env, ...options?.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

/**
 * Run a command with inherited stdio (shows output in real-time).
 */
function runCommandInherit(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<number> {
  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd: options?.cwd ?? PLATFORM_DIR,
      env: { ...process.env, ...options?.env },
      stdio: 'inherit',
      shell: true,
    }

    const child = spawn(command, args, spawnOptions)

    child.on('close', (code) => {
      resolve(code ?? 0)
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Run a command and capture stdout while showing output in real-time.
 * Used to capture the API key from the seeding script.
 */
function runCommandCapture(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd: options?.cwd ?? PLATFORM_DIR,
      env: { ...process.env, ...options?.env },
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: true,
    }

    const child = spawn(command, args, spawnOptions)
    let stdout = ''

    child.stdout?.on('data', (data) => {
      const str = data.toString()
      stdout += str
      process.stdout.write(str)
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout })
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Check if Docker is running.
 */
function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Check if local Supabase is running.
 */
function isSupabaseRunning(): boolean {
  try {
    const result = runCommand('supabase status', {
      cwd: PLATFORM_DIR,
    })
    return result.includes('API URL')
  } catch {
    return false
  }
}

/**
 * Start local Supabase if not running.
 */
async function ensureSupabaseRunning(): Promise<void> {
  if (isSupabaseRunning()) {
    logSuccess('Local Supabase is already running')
    return
  }

  logInfo('Starting local Supabase...')
  const code = await runCommandInherit('supabase', ['start'], {
    cwd: PLATFORM_DIR,
  })

  if (code !== 0) {
    throw new Error('Failed to start local Supabase')
  }

  logSuccess('Local Supabase started')
}

/**
 * Extract the API key from the seeding script output.
 */
function extractApiKey(output: string): string | null {
  // Look for the line: FLOWGLAD_SECRET_KEY=sk_test_...
  const match = output.match(/FLOWGLAD_SECRET_KEY=(sk_test_[^\s\n]+)/)
  return match ? match[1] : null
}

// ============================================================================
// Main Steps
// ============================================================================

/**
 * Step 1: Validate the playground exists.
 */
function validatePlayground(playgroundName: string): void {
  const playgroundPath = path.join(PLAYGROUND_DIR, playgroundName)

  if (!fs.existsSync(playgroundPath)) {
    logError(`Playground not found: ${playgroundName}`)
    console.log(`\nAvailable playgrounds:`)
    AVAILABLE_PLAYGROUNDS.forEach((name) => {
      console.log(`  ${SYMBOLS.bullet} ${name}`)
    })
    process.exit(1)
  }

  // Verify pricing.yaml exists
  const pricingYamlPath = path.join(playgroundPath, 'pricing.yaml')
  if (!fs.existsSync(pricingYamlPath)) {
    logError(
      `pricing.yaml not found in playground: ${playgroundName}`
    )
    process.exit(1)
  }
}

/**
 * Step 2: Copy staging schema to local Supabase.
 */
async function copyDatabaseSchema(): Promise<void> {
  logInfo('Copying staging schema to local Supabase...')
  logDim('Running: bun run dbCopy --staging --schema-only --no-dev')

  const code = await runCommandInherit(
    'bun',
    ['run', 'dbCopy', '--staging', '--schema-only', '--no-dev'],
    { cwd: PLATFORM_DIR }
  )

  if (code !== 0) {
    throw new Error('Failed to copy database schema')
  }

  logSuccess('Database schema copied successfully')
}

/**
 * Step 3: Seed the platform database.
 * Returns the API key token.
 */
async function seedPlatformDatabase(
  playgroundName: string
): Promise<string> {
  logInfo(`Seeding platform database for ${playgroundName}...`)
  logDim(
    `Running: FORCE_TEST_MODE=1 bun run seed:playground ${playgroundName}`
  )

  const { code, stdout } = await runCommandCapture(
    'bun',
    ['run', 'seed:playground', playgroundName],
    {
      cwd: PLATFORM_DIR,
      env: { ...process.env, FORCE_TEST_MODE: '1' },
    }
  )

  if (code !== 0) {
    throw new Error('Failed to seed platform database')
  }

  const apiKey = extractApiKey(stdout)
  if (!apiKey) {
    throw new Error('Failed to extract API key from seeding output')
  }

  logSuccess('Platform database seeded successfully')
  return apiKey
}

/**
 * Step 4: Generate the playground's .env.local file.
 */
function generateEnvLocal(
  playgroundName: string,
  apiKey: string
): void {
  const playgroundPath = path.join(PLAYGROUND_DIR, playgroundName)
  const envLocalPath = path.join(playgroundPath, '.env.local')
  const dbConfig =
    PLAYGROUND_DB[playgroundName as keyof typeof PLAYGROUND_DB]

  if (!dbConfig) {
    throw new Error(
      `No database configuration for playground: ${playgroundName}`
    )
  }

  const betterAuthSecret = generateSecret()

  const envContent = `# Auto-generated by initPlayground.ts
# Do not commit this file to version control

# Database Configuration
DATABASE_URL=${dbConfig.databaseUrl}

# BetterAuth Configuration
BETTER_AUTH_SECRET=${betterAuthSecret}

# Application Configuration
NEXT_PUBLIC_BASE_URL=http://localhost:3001
PORT=3001

# Flowglad Configuration
FLOWGLAD_SECRET_KEY=${apiKey}
FLOWGLAD_API_URL=http://localhost:3000
`

  fs.writeFileSync(envLocalPath, envContent, 'utf-8')
  logSuccess(`Generated ${envLocalPath}`)
}

/**
 * Step 5: Set up the playground's local database.
 * We explicitly pass DATABASE_URL to ensure drizzle-kit can connect,
 * as the dotenv loading in drizzle.config.ts may not work reliably
 * when spawned from this script.
 */
async function setupPlaygroundDatabase(
  playgroundName: string
): Promise<void> {
  const playgroundPath = path.join(PLAYGROUND_DIR, playgroundName)
  const dbConfig =
    PLAYGROUND_DB[playgroundName as keyof typeof PLAYGROUND_DB]

  if (!dbConfig) {
    throw new Error(
      `No database configuration for playground: ${playgroundName}`
    )
  }

  logInfo('Setting up playground database...')
  logDim('Running: bun run db:setup')

  const code = await runCommandInherit('bun', ['run', 'db:setup'], {
    cwd: playgroundPath,
    env: { ...process.env, DATABASE_URL: dbConfig.databaseUrl },
  })

  if (code !== 0) {
    throw new Error('Failed to set up playground database')
  }

  logSuccess('Playground database set up successfully')
}

/**
 * Print the final summary.
 */
function printSummary(playgroundName: string, apiKey: string): void {
  const dbConfig =
    PLAYGROUND_DB[playgroundName as keyof typeof PLAYGROUND_DB]

  console.log('\n' + '='.repeat(60))
  console.log(
    `${COLORS.green}${COLORS.bold}Playground initialized successfully!${COLORS.reset}`
  )
  console.log('='.repeat(60))

  console.log(
    `\n${COLORS.bold}Platform Login Credentials:${COLORS.reset}`
  )
  console.log(`  Email:    ${PLATFORM_USER.email}`)
  console.log(`  Password: ${PLATFORM_USER.password}`)

  console.log(`\n${COLORS.bold}Playground API Key:${COLORS.reset}`)
  console.log(`  ${apiKey}`)

  console.log(`\n${COLORS.bold}URLs:${COLORS.reset}`)
  console.log(`  Platform:   http://localhost:3000`)
  console.log(`  Playground: http://localhost:3001`)

  console.log(`\n${COLORS.bold}Database:${COLORS.reset}`)
  console.log(
    `  Platform (Supabase): postgresql://postgres:postgres@localhost:54322/postgres`
  )
  console.log(`  Playground: ${dbConfig?.databaseUrl}`)

  console.log(`\n${COLORS.bold}Next Steps:${COLORS.reset}`)
  console.log(`  1. Start the platform with local playground mode:`)
  console.log(
    `     ${COLORS.cyan}cd platform/flowglad-next && FLOWGLAD_LOCAL_PLAYGROUND=true bun run dev${COLORS.reset}`
  )
  console.log(`  2. In another terminal, start the playground:`)
  console.log(
    `     ${COLORS.cyan}cd playground/${playgroundName} && bun run dev${COLORS.reset}`
  )
  console.log(
    `  3. Open the platform dashboard: http://localhost:3000`
  )
  console.log(`  4. Log in with the credentials above`)
  console.log(`  5. Open the playground: http://localhost:3001`)

  console.log('\n' + '='.repeat(60))
}

/**
 * Start all playground services in background with log files.
 */
async function startServices(playgroundName: string): Promise<void> {
  const playgroundPath = path.join(PLAYGROUND_DIR, playgroundName)

  // Create logs directory
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  }

  // Clear old log files
  const platformLogFile = path.join(LOGS_DIR, 'platform.log')
  const playgroundLogFile = path.join(LOGS_DIR, 'playground.log')
  const triggerLogFile = path.join(LOGS_DIR, 'trigger.log')

  fs.writeFileSync(platformLogFile, '')
  fs.writeFileSync(playgroundLogFile, '')
  fs.writeFileSync(triggerLogFile, '')

  const pids: {
    platform?: number
    playground?: number
    trigger?: number
  } = {}

  // Start platform
  logInfo('Starting platform...')
  const platformOut = fs.openSync(platformLogFile, 'a')
  const platformProcess = spawn('bun', ['run', 'dev'], {
    cwd: PLATFORM_DIR,
    env: { ...process.env, FLOWGLAD_LOCAL_PLAYGROUND: 'true' },
    stdio: ['ignore', platformOut, platformOut],
    detached: true,
  })
  platformProcess.unref()
  pids.platform = platformProcess.pid

  // Wait a bit for platform to start
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Start playground
  // Explicitly set DATABASE_URL to prevent inheriting platform's DATABASE_URL
  // (Next.js prioritizes process.env over .env.local)
  const dbConfig =
    PLAYGROUND_DB[playgroundName as keyof typeof PLAYGROUND_DB]
  logInfo('Starting playground...')
  const playgroundOut = fs.openSync(playgroundLogFile, 'a')
  const playgroundProcess = spawn('bun', ['run', 'dev'], {
    cwd: playgroundPath,
    env: { ...process.env, DATABASE_URL: dbConfig.databaseUrl },
    stdio: ['ignore', playgroundOut, playgroundOut],
    detached: true,
  })
  playgroundProcess.unref()
  pids.playground = playgroundProcess.pid

  // Start trigger.dev
  logInfo('Starting trigger.dev...')
  const triggerOut = fs.openSync(triggerLogFile, 'a')
  const triggerProcess = spawn('bun', ['run', 'trigger:dev'], {
    cwd: PLATFORM_DIR,
    stdio: ['ignore', triggerOut, triggerOut],
    detached: true,
  })
  triggerProcess.unref()
  pids.trigger = triggerProcess.pid

  // Save PIDs for stop script
  fs.writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2))

  logSuccess('All services started')
}

/**
 * Print the summary when services are running.
 */
function printRunningSummary(
  playgroundName: string,
  apiKey: string
): void {
  const dbConfig =
    PLAYGROUND_DB[playgroundName as keyof typeof PLAYGROUND_DB]

  console.log('\n' + '='.repeat(60))
  console.log(
    `${COLORS.green}${COLORS.bold}Playground initialized and running!${COLORS.reset}`
  )
  console.log('='.repeat(60))

  console.log(
    `\n${COLORS.bold}Platform Login Credentials:${COLORS.reset}`
  )
  console.log(`  Email:    ${PLATFORM_USER.email}`)
  console.log(`  Password: ${PLATFORM_USER.password}`)

  console.log(`\n${COLORS.bold}Playground API Key:${COLORS.reset}`)
  console.log(`  ${apiKey}`)

  console.log(`\n${COLORS.bold}URLs:${COLORS.reset}`)
  console.log(`  Platform:   http://localhost:3000`)
  console.log(`  Playground: http://localhost:3001`)

  console.log(`\n${COLORS.bold}Database:${COLORS.reset}`)
  console.log(
    `  Platform (Supabase): postgresql://postgres:postgres@localhost:54322/postgres`
  )
  console.log(`  Playground: ${dbConfig?.databaseUrl}`)

  console.log(`\n${COLORS.bold}View Logs:${COLORS.reset}`)
  console.log(
    `  ${COLORS.cyan}tail -f .playground-logs/platform.log${COLORS.reset}   # Platform`
  )
  console.log(
    `  ${COLORS.cyan}tail -f .playground-logs/playground.log${COLORS.reset} # Playground`
  )
  console.log(
    `  ${COLORS.cyan}tail -f .playground-logs/trigger.log${COLORS.reset}    # Trigger.dev`
  )

  console.log(`\n${COLORS.bold}Stop Services:${COLORS.reset}`)
  console.log(
    `  ${COLORS.cyan}cd platform/flowglad-next && bun run stop:playground${COLORS.reset}`
  )

  console.log('\n' + '='.repeat(60))
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const noDev = args.includes('--no-dev')
  const playgroundName = args.filter(
    (arg) => !arg.startsWith('--')
  )[0]

  // Show usage if no playground specified
  if (
    !playgroundName ||
    playgroundName === '--help' ||
    playgroundName === '-h'
  ) {
    console.log(
      'Usage: bun run init:playground <playground-name> [--no-dev]'
    )
    console.log('\nOptions:')
    console.log(
      '  --no-dev    Setup only, do not start services automatically'
    )
    console.log('\nAvailable playgrounds:')
    AVAILABLE_PLAYGROUNDS.forEach((name) => {
      console.log(`  ${SYMBOLS.bullet} ${name}`)
    })
    process.exit(playgroundName ? 0 : 1)
  }

  console.log(
    `\n${COLORS.bold}Initializing playground: ${playgroundName}${COLORS.reset}\n`
  )

  const totalSteps = noDev ? 5 : 6

  // Validate Docker is running
  if (!isDockerRunning()) {
    logError(
      'Docker is not running. Please start Docker and try again.'
    )
    process.exit(1)
  }

  try {
    // Step 1: Validate playground
    logStep(1, totalSteps, 'Validating playground')
    validatePlayground(playgroundName)
    logSuccess(`Playground '${playgroundName}' found`)

    // Step 2: Ensure Supabase is running and copy schema
    logStep(2, totalSteps, 'Setting up platform database')
    await ensureSupabaseRunning()
    await copyDatabaseSchema()

    // Step 3: Seed platform database
    logStep(3, totalSteps, 'Seeding platform database')
    const apiKey = await seedPlatformDatabase(playgroundName)

    // Step 4: Generate .env.local
    logStep(4, totalSteps, 'Generating playground environment')
    generateEnvLocal(playgroundName, apiKey)

    // Step 5: Set up playground database
    logStep(5, totalSteps, 'Setting up playground database')
    await setupPlaygroundDatabase(playgroundName)

    if (noDev) {
      // Print manual setup instructions
      printSummary(playgroundName, apiKey)
    } else {
      // Step 6: Start all services
      logStep(6, totalSteps, 'Starting services')
      await startServices(playgroundName)

      // Print running summary with log commands
      printRunningSummary(playgroundName, apiKey)
    }

    process.exit(0)
  } catch (error) {
    logError(`Initialization failed: ${error}`)
    process.exit(1)
  }
}

main()
