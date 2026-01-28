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

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// ============================================================================
// Environment Loading for NODE_ENV=integration
// ============================================================================
// Bun only auto-loads .env.test, .env.development, .env.production.
// For NODE_ENV=integration, we must load .env.integration explicitly.
// This must happen FIRST, before any other code uses env vars.

function loadEnvIntegration(): void {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()

  if (nodeEnv !== 'integration') return

  const envPath = resolve(process.cwd(), '.env.integration')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex)
    let value = trimmed.slice(eqIndex + 1)

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // Override env vars for integration (we want these values, not the auto-loaded ones)
    process.env[key] = value
  }
}

// Load integration env FIRST, before anything else
loadEnvIntegration()

// ============================================================================
// Environment Detection
// ============================================================================

export type NodeEnvType =
  | 'development'
  | 'production'
  | 'test'
  | 'integration'

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
 * 1. If NODE_ENV is 'integration' → 'integration' (explicit, takes precedence)
 * 2. If script name starts with "test" → 'test'
 * 3. If NODE_ENV is 'production' → 'production'
 * 4. If NODE_ENV is 'test' → 'test'
 * 5. Otherwise → 'development' (default)
 */
export function getEffectiveNodeEnv(): NodeEnvType {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()

  // Integration takes precedence - explicitly set by test runner for integration tests
  if (nodeEnv === 'integration') return 'integration'

  // Auto-detect test environment from script name
  if (isTestScript()) return 'test'

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
    integration: '.env.integration',
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
    } else if (nodeEnv === 'integration') {
      console.warn(
        'To set up: bun run vercel:env-pull:dev (generates .env.integration)'
      )
    }
    return
  }
  console.log(`Environment: ${nodeEnv} (using ${envFile})`)
}

// Run environment validation when this module is loaded
validateEnvironmentFiles()
