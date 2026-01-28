/**
 * Integration test setup for bun:test
 *
 * This runs before integration tests to set up the environment and seed the database.
 * Unlike unit tests, integration tests make real API calls to Stripe and other services.
 *
 * Integration tests use .env.integration (loaded via NODE_ENV=integration)
 * which contains real API credentials but no STRIPE_MOCK_HOST.
 *
 * Setup: Run `bun run vercel:env-pull:dev` to auto-generate .env.integration
 */

import { existsSync } from 'fs'
import { resolve } from 'path'

// Verify .env.integration exists
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

// Verify STRIPE_MOCK_HOST is NOT set - integration tests must use real Stripe API
if (process.env.STRIPE_MOCK_HOST) {
  console.error(
    '\n❌ STRIPE_MOCK_HOST is set but integration tests require real Stripe API.\n'
  )
  console.error(
    'Integration tests use .env.integration which should NOT contain STRIPE_MOCK_HOST.'
  )
  console.error(
    'If you see this error, check your .env.integration file and remove STRIPE_MOCK_HOST.\n'
  )
  process.exit(1)
}

// Import integration-specific mocks first (required for bun:test)
// Uses bun.integration.mocks.ts which does NOT mock Redis/Svix,
// allowing integration tests to make real API calls or use _setTestRedisClient()
import './bun.integration.mocks'

import { beforeAll } from 'bun:test'
import { seedDatabase } from './seedDatabase'

// NO MSW servers - we want real API calls
// Redis will automatically use real credentials from .env.integration

beforeAll(async () => {
  await seedDatabase()
})
