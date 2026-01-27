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

// ============================================================================
// Utility Functions (kept for backward compatibility with tests)
// ============================================================================

/**
 * Patterns that identify a database URL as "local" and safe for development.
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

/**
 * @deprecated Safety check has been moved to src/db/client.ts
 * This function is kept for backward compatibility with tests.
 */
export function shouldSkipSafetyCheck(): boolean {
  return (
    process.env.VERCEL !== undefined ||
    process.env.CI !== undefined ||
    process.env.DANGEROUSLY_ALLOW_REMOTE_DB !== undefined
  )
}
