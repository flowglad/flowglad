/**
 * Integration test setup for bun:test
 *
 * This runs before integration tests to set up the environment and seed the database.
 * Unlike unit tests, integration tests make real API calls to Stripe and other services.
 *
 * Integration tests use .env.integration which contains real API credentials but no STRIPE_MOCK_HOST.
 *
 * IMPORTANT: This file explicitly loads .env.integration because Bun only auto-loads
 * .env.test, .env.development, and .env.production. NODE_ENV=integration is not
 * recognized by Bun's automatic env loading.
 *
 * IMPORTANT: We use top-level await with dynamic imports to ensure env vars are set
 * BEFORE any modules that use them are loaded. Static imports are hoisted in ESM,
 * so we can't use them before executing synchronous code.
 *
 * Setup: Run `bun run vercel:env-pull:dev` to auto-generate .env.integration
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// ============================================================================
// Step 1: Load .env.integration FIRST (before any dynamic imports)
// ============================================================================

const integrationEnvPath = resolve(
  import.meta.dir,
  '.env.integration'
)
if (!existsSync(integrationEnvPath)) {
  console.error(
    '\n❌ .env.integration not found. Integration tests require real API credentials.\n'
  )
  console.error('To set up, run:')
  console.error('  bun run vercel:env-pull:dev\n')
  console.error(
    'This will pull .env.development and auto-generate .env.integration.\n'
  )
  process.exit(1)
}

// Load env vars synchronously BEFORE any dynamic imports
const envContent = readFileSync(integrationEnvPath, 'utf-8')
for (const line of envContent.split('\n')) {
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

  // Always override - Bun auto-loads .env.development before preloads run,
  // so we need to forcefully override with .env.integration values
  process.env[key] = value
}

// Check if .env.integration incorrectly contains STRIPE_MOCK_HOST
// (This check must happen BEFORE we delete it below)
if (process.env.STRIPE_MOCK_HOST) {
  // Check if it came from .env.integration (we just loaded it) vs Bun's auto-load of .env.test
  // If .env.integration has it, that's a configuration error
  if (envContent.includes('STRIPE_MOCK_HOST')) {
    console.error(
      '\n❌ STRIPE_MOCK_HOST found in .env.integration but integration tests require real Stripe API.\n'
    )
    console.error(
      'Remove STRIPE_MOCK_HOST from .env.integration, or regenerate it with:'
    )
    console.error('  bun run vercel:env-pull:dev\n')
    process.exit(1)
  }
}

// Delete STRIPE_MOCK_HOST - it may have been set by Bun loading .env.test
// (due to script name starting with "test"), but integration tests need real Stripe
delete process.env.STRIPE_MOCK_HOST

// Guard against mock server hosts being set - integration tests should use real APIs
// Note: TRIGGER_API_URL is intentionally NOT included here because we want integration
// tests to use the mock server for Trigger.dev to avoid triggering real background jobs
const mockHostVars = ['SVIX_MOCK_HOST', 'UNKEY_MOCK_HOST'] as const

// Check for localhost variants: hostname, IPv4 loopback, IPv6 loopback
const isLocalhostUrl = (url: string): boolean => {
  const lower = url.toLowerCase()
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('[::1]')
  )
}

for (const envVar of mockHostVars) {
  const value = process.env[envVar]
  if (value && isLocalhostUrl(value)) {
    // Delete localhost mock URLs - they may have been set by Bun loading .env.test
    // Integration tests should use real APIs, not mock servers
    delete process.env[envVar]
  }
}

// Set FORCE_TEST_MODE so IS_TEST=true in core.ts
// This is needed because we use NODE_ENV=integration (not 'test')
process.env.FORCE_TEST_MODE = '1'

// ============================================================================
// Step 2: NOW dynamically import modules that depend on env vars
// ============================================================================

// Import integration-specific mocks first (required for bun:test)
// Uses bun.integration.mocks.ts which does NOT mock Redis/Svix,
// allowing integration tests to make real API calls or use _setTestRedisClient()
await import('./bun.integration.mocks')

const { beforeAll } = await import('bun:test')
const { seedDatabase } = await import('./seedDatabase')

// NO MSW servers - we want real API calls
// Redis will automatically use real credentials from .env.integration

beforeAll(async () => {
  await seedDatabase()
})
