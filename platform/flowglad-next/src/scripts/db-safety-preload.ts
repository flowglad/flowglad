/**
 * Bun preload script for environment detection and validation.
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
 * Database Safety:
 * The DATABASE_URL safety check has been moved to src/db/client.ts.
 * This means scripts that don't import the database module are never blocked,
 * regardless of what DATABASE_URL is set to. The check only runs when a script
 * actually tries to use the database.
 */

import { existsSync } from 'fs'
import { resolve } from 'path'

// ============================================================================
// Environment Detection
// ============================================================================

export type NodeEnvType = 'development' | 'production' | 'test'

/**
 * Scripts that don't require environment files.
 * These bootstrap/setup scripts run before env files exist.
 */
const BOOTSTRAP_SCRIPTS = [
  'user', // setup-env-user.ts - creates .env_user file
  'vercel:env-pull', // pulls env from Vercel
  'install-packages', // bun install wrapper
] as const

/**
 * Check if the current script is a bootstrap script that doesn't need env files.
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

// ============================================================================
// Environment File Validation
// ============================================================================

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

// Run environment validation when this module is loaded
validateEnvironmentFiles()
