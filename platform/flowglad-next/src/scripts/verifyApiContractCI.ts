/**
 * CI-friendly API contract verification script.
 *
 * Unlike the scriptRunner-based version, this script:
 * - Does not pull env vars from Vercel (expects them to be set in CI)
 * - Does not require a database connection
 * - Exits with appropriate status codes for CI
 *
 * Required environment variables:
 * - TELEMETRY_TEST_API_KEY: API key for the Flowglad instance
 * - FLOWGLAD_PROD_API_URL: Base URL of the Flowglad instance to test against
 *
 * Usage:
 *   bunx tsx src/scripts/verifyApiContractCI.ts
 */

// Map FLOWGLAD_PROD_API_URL to NEXT_PUBLIC_APP_URL for the underlying client
if (process.env.FLOWGLAD_PROD_API_URL) {
  process.env.NEXT_PUBLIC_APP_URL = process.env.FLOWGLAD_PROD_API_URL
}

import verifyApiContract from '@/api-contract/verify'

const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
}

const requiredEnvVars = [
  'TELEMETRY_TEST_API_KEY',
  'FLOWGLAD_PROD_API_URL',
]

const missingEnvVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar]
)

if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  )
  process.exit(1)
}

verifyApiContract(logger)
  .then(() => {
    console.log('✅ API contract verification passed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ API contract verification failed:', error)
    process.exit(1)
  })
