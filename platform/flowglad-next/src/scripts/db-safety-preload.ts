/**
 * Bun preload script for database safety and environment validation.
 *
 * IMPORTANT: DEVELOPMENT IS THE DEFAULT
 * When NODE_ENV is unset, this script defaults to "development" and requires
 * .env.development to exist. This is an interim solution - future iterations
 * will add support for full local development without Vercel credentials.
 *
 * Environment Detection:
 * - Scripts starting with "test" → uses .env.test (automatic detection)
 * - NODE_ENV=production          → uses .env.production (Vercel prod)
 * - NODE_ENV=test                → uses .env.test (explicit)
 * - Otherwise                    → uses .env.development (DEFAULT)
 *
 * This script validates that required env files exist before Bun loads them.
 *
 * Safety Check:
 * This script blocks execution if DATABASE_URL points to a non-local database.
 *
 * Skips the check when:
 * - VERCEL is set (Vercel deployments)
 * - CI is set (CI/CD pipelines)
 * - DANGEROUSLY_ALLOW_REMOTE_DB is set (explicit opt-out)
 *
 * Note: NODE_ENV=production intentionally does NOT bypass the safety check.
 * It's too easy for an AI agent to accidentally use it. Use DANGEROUSLY_ALLOW_REMOTE_DB instead.
 */

import { existsSync } from 'fs'
import { resolve } from 'path'

// ============================================================================
// Environment Validation
// ============================================================================

export type NodeEnvType = 'development' | 'production' | 'test'

/**
 * Scripts that don't require database access.
 * These bootstrap/setup scripts should skip the DATABASE_URL safety check.
 */
const BOOTSTRAP_SCRIPTS = [
  'user', // setup-env-user.ts - creates .env_user file
  'vercel:env-pull', // pulls env from Vercel
  'install-packages', // bun install wrapper
] as const

/**
 * Check if the current script is a bootstrap script that doesn't need database access.
 */
export function isBootstrapScript(): boolean {
  const scriptName =
    process.env.npm_lifecycle_event?.toLowerCase() ?? ''
  return BOOTSTRAP_SCRIPTS.some(
    (bootstrap) =>
      scriptName === bootstrap ||
      scriptName.startsWith(`${bootstrap}:`)
  )
}

/**
 * Check if the current npm script name starts with "test".
 * Uses npm_lifecycle_event which is set by bun/npm when running scripts.
 */
export function isTestScript(): boolean {
  const scriptName =
    process.env.npm_lifecycle_event?.toLowerCase() ?? ''
  return scriptName.startsWith('test')
}

/**
 * Get the effective NODE_ENV.
 *
 * Detection order:
 * 1. If script name starts with "test" → 'test'
 * 2. If NODE_ENV is 'production' → 'production'
 * 3. If NODE_ENV is 'test' → 'test'
 * 4. Otherwise → 'development' (default)
 */
export function getEffectiveNodeEnv(): NodeEnvType {
  // Auto-detect test environment from script name
  if (isTestScript()) return 'test'

  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if (nodeEnv === 'production') return 'production'
  if (nodeEnv === 'test') return 'test'
  return 'development' // Default to development
}

function validateEnvironmentFiles(): void {
  // Skip in Vercel/CI - they manage their own env
  if (
    process.env.VERCEL !== undefined ||
    process.env.CI !== undefined
  )
    return

  // Skip when not running an npm/bun script (e.g., `bun -e`, `bunx`, etc.)
  const scriptName = process.env.npm_lifecycle_event
  if (!scriptName) return

  // Skip for bootstrap scripts that don't need env files
  if (isBootstrapScript()) return

  const nodeEnv = getEffectiveNodeEnv()

  // Map NODE_ENV to the expected env file
  const envFileMap: Record<NodeEnvType, string> = {
    development: '.env.development',
    production: '.env.production',
    test: '.env.test',
  }

  const envFile = envFileMap[nodeEnv]
  const envPath = resolve(process.cwd(), envFile)

  if (!existsSync(envPath)) {
    // Just warn - don't block. Commands that need DB will fail naturally.
    console.warn(`Warning: ${envFile} does not exist.`)
    if (nodeEnv === 'development') {
      console.warn('To set up: bun run vercel:env-pull:dev')
    } else if (nodeEnv === 'production') {
      console.warn('To set up: bun run vercel:env-pull:prod')
    } else if (nodeEnv === 'test') {
      console.warn('To set up: bun run test:setup')
    }
    return
  }
  console.log(`Environment: ${nodeEnv} (using ${envFile})`)
}

// Validate environment files exist
validateEnvironmentFiles()

// ============================================================================
// Configuration
// ============================================================================

/**
 * Patterns that identify a database URL as "local" and safe for development scripts.
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
 * Commands that are safe to run without local database validation.
 * These commands don't connect to the database at all.
 */
export const SAFE_COMMANDS = [
  // Type checking and linting
  'typecheck',
  'lint',
  'format',
  'check',

  // Build and install
  'build',
  'install',
  'install-packages',

  // Validation scripts that don't need DB
  'validate:registry',
  'validate:mock-import-order',

  // Biome direct calls
  'biome',
  '@biomejs/biome',

  // TypeScript direct calls
  'tsc',
] as const

/**
 * Check if the current command is in the safe list.
 * These commands don't need database access and should be allowed
 * to run even when DATABASE_URL points to a remote database.
 */
export function isCommandSafe(): boolean {
  // Get the script being run via npm/bun
  const scriptName = process.env.npm_lifecycle_event

  if (scriptName) {
    return SAFE_COMMANDS.some((cmd) => scriptName.includes(cmd))
  }

  // Check Bun.argv for direct execution
  const args = typeof Bun !== 'undefined' ? Bun.argv.slice(2) : []

  // Check for 'bun run <script>' pattern
  if (args[0] === 'run' && args[1]) {
    return SAFE_COMMANDS.some((cmd) => args[1].includes(cmd))
  }

  // Check for direct execution (bun <script>)
  if (args[0]) {
    return SAFE_COMMANDS.some((cmd) => args[0].includes(cmd))
  }

  return false
}

// ANSI colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a database URL points to a local database.
 *
 * @param url - The DATABASE_URL to check
 * @returns true if the URL points to a recognized local host
 */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    let hostname = parsed.hostname.toLowerCase()

    // Strip IPv6 brackets if present (URL parser keeps them)
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1)
    }

    return LOCAL_HOST_PATTERNS.some((pattern) => {
      if (pattern.startsWith('.')) {
        // Suffix match (e.g., .local)
        return hostname.endsWith(pattern)
      }
      // Exact match
      return hostname === pattern
    })
  } catch {
    // If URL parsing fails, assume it's not local (safer)
    return false
  }
}

/**
 * Mask credentials in a database URL for safe display in error messages.
 * Uses URL object manipulation to ensure percent-encoded passwords are handled correctly.
 *
 * @param url - The DATABASE_URL to mask
 * @returns URL with password replaced by ****
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
    // If parsing fails, return a generic message
    return '(invalid URL)'
  }
}

// ============================================================================
// Safety Check Logic
// ============================================================================

/**
 * Check if we should skip the database safety check.
 *
 * Note: NODE_ENV=production is intentionally NOT a bypass condition.
 * It's too easy for an AI agent to accidentally use it. The VERCEL/CI
 * env vars are set automatically by platforms, not manually.
 */
export function shouldSkipSafetyCheck(): boolean {
  return (
    process.env.VERCEL !== undefined ||
    process.env.CI !== undefined ||
    process.env.DANGEROUSLY_ALLOW_REMOTE_DB !== undefined ||
    isBootstrapScript() ||
    isCommandSafe()
  )
}

/**
 * Print an error message and exit when blocking a remote database connection.
 */
function blockAndExit(databaseUrl: string): never {
  const maskedUrl = maskDatabaseUrl(databaseUrl)

  console.error('')
  console.error(
    `${COLORS.red}${COLORS.bold}BLOCKED:${COLORS.reset} DATABASE_URL points to non-local database`
  )
  console.error(`${COLORS.dim}${maskedUrl}${COLORS.reset}`)
  console.error('')
  console.error(
    `${COLORS.yellow}Recognized local hosts:${COLORS.reset}`
  )
  for (const pattern of LOCAL_HOST_PATTERNS) {
    console.error(`  ${COLORS.dim}- ${pattern}${COLORS.reset}`)
  }
  console.error('')
  console.error(`${COLORS.cyan}To bypass this check:${COLORS.reset}`)
  console.error(
    `  ${COLORS.dim}DANGEROUSLY_ALLOW_REMOTE_DB=1 bun run <script>${COLORS.reset}`
  )
  console.error('')

  process.exit(1)
}

/**
 * Main preload logic - runs on module load.
 */
function runSafetyCheck(): void {
  // Skip check in production/CI environments
  if (shouldSkipSafetyCheck()) {
    return
  }

  const databaseUrl = process.env.DATABASE_URL

  // No DATABASE_URL set - nothing to check
  if (!databaseUrl) {
    return
  }

  // Check if database URL is local
  if (!isLocalDatabaseUrl(databaseUrl)) {
    blockAndExit(databaseUrl)
  }
}

// Execute the safety check when this module is loaded
runSafetyCheck()
