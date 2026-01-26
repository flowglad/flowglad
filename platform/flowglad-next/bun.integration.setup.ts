/**
 * Integration test setup for bun:test
 *
 * This runs before integration tests to set up the environment and seed the database.
 * Unlike unit tests, integration tests make real API calls to Stripe and other services.
 *
 * Integration tests load credentials from .env.development (for real Stripe/Redis keys)
 * while still using the test database from .env.test.
 */

// Load real API credentials from .env.development BEFORE importing mocks
// This allows integration tests to use real Stripe keys while keeping the test database
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Keys we want to load from .env.development (real API credentials)
// These will OVERRIDE the stub values from .env.test
const INTEGRATION_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_TEST_MODE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

// Load specific keys from .env.development to override .env.test stubs
// Use import.meta.dir to resolve relative to this file, not cwd
const devEnvPath = resolve(import.meta.dir, '.env.development')
if (existsSync(devEnvPath)) {
  const devEnvContent = readFileSync(devEnvPath, 'utf-8')
  for (const line of devEnvContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex)
    if (INTEGRATION_KEYS.includes(key)) {
      // Remove surrounding quotes if present
      let value = trimmed.slice(eqIndex + 1)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  }
} else {
  console.warn(
    'Warning: .env.development not found. Integration tests will use stub credentials.'
  )
  console.warn('To set up: bun run vercel:env-pull:dev')
}

// Import mocks first (required for bun:test)
// Note: Uses standard bun.mocks which includes Redis/Svix mocks.
// The REDIS_INTEGRATION_TEST_MODE flag below allows real Redis when needed.
import './bun.mocks'

import { beforeAll } from 'bun:test'
import { seedDatabase } from './seedDatabase'

// NO MSW servers - we want real API calls

// Enable integration test mode for Stripe client
// This allows the stripe() function to use real API keys instead of fake test keys
process.env.STRIPE_INTEGRATION_TEST_MODE = 'true'

// Enable integration test mode for Redis client
// This allows the redis() function to use real Upstash connection instead of test stub
process.env.REDIS_INTEGRATION_TEST_MODE = 'true'

beforeAll(async () => {
  await seedDatabase()
})
