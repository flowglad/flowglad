#!/usr/bin/env bun
/**
 * Generates .env.integration from .env.development and .env.test
 *
 * This script:
 * 1. Uses .env.test as the base (database URL, app config)
 * 2. Overlays real API credentials from .env.development
 * 3. Removes STRIPE_MOCK_HOST so integration tests use real Stripe
 *
 * Usage: bun run src/scripts/generate-integration-env.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '../..')

const ENV_TEST_PATH = resolve(PROJECT_ROOT, '.env.test')
const ENV_DEV_PATH = resolve(PROJECT_ROOT, '.env.development')
const ENV_INTEGRATION_PATH = resolve(PROJECT_ROOT, '.env.integration')

// Keys to pull from .env.development (real API credentials)
const KEYS_FROM_DEVELOPMENT = [
  'STRIPE_SECRET_KEY',
  'STRIPE_TEST_MODE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

// Keys to exclude from .env.integration (they trigger stripe-mock)
const KEYS_TO_EXCLUDE = [
  'STRIPE_MOCK_HOST',
  'STRIPE_MOCK_PORT',
  'STRIPE_PROTOCOL',
]

function parseEnvFile(path: string): Map<string, string> {
  const content = readFileSync(path, 'utf-8')
  const env = new Map<string, string>()

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

    env.set(key, value)
  }

  return env
}

function main() {
  // Verify source files exist
  if (!existsSync(ENV_TEST_PATH)) {
    console.error('❌ .env.test not found')
    process.exit(1)
  }

  if (!existsSync(ENV_DEV_PATH)) {
    console.error('❌ .env.development not found')
    console.error('   Run: bun run vercel:env-pull:dev')
    process.exit(1)
  }

  // Parse source files
  const testEnv = parseEnvFile(ENV_TEST_PATH)
  const devEnv = parseEnvFile(ENV_DEV_PATH)

  // Start with .env.test as base
  const integrationEnv = new Map(testEnv)

  // Remove stripe-mock config keys
  for (const key of KEYS_TO_EXCLUDE) {
    integrationEnv.delete(key)
  }

  // Overlay real credentials from .env.development
  for (const key of KEYS_FROM_DEVELOPMENT) {
    const value = devEnv.get(key)
    if (value) {
      integrationEnv.set(key, value)
    } else {
      console.warn(`⚠️  ${key} not found in .env.development`)
    }
  }

  // Add integration-specific settings
  integrationEnv.set('SKIP_STRIPE_TAX_CALCULATIONS', 'true')

  // Generate output
  const lines = [
    '# Auto-generated integration test environment',
    '# Generated from .env.test + .env.development',
    `# Created: ${new Date().toISOString()}`,
    '#',
    '# This file uses real Stripe/Redis APIs (no stripe-mock)',
    '# Regenerate with: bun run src/scripts/generate-integration-env.ts',
    '',
  ]

  for (const [key, value] of integrationEnv) {
    // Quote values that contain special characters
    const needsQuotes = value.includes(' ') || value.includes('#')
    const formattedValue = needsQuotes ? `"${value}"` : value
    lines.push(`${key}=${formattedValue}`)
  }

  writeFileSync(ENV_INTEGRATION_PATH, lines.join('\n') + '\n')

  console.log('✅ Generated .env.integration')
  console.log('   - Base: .env.test (database, app config)')
  console.log('   - Credentials: .env.development (Stripe, Redis)')
  console.log('   - Removed: STRIPE_MOCK_HOST (uses real Stripe API)')
}

main()
