/**
 * CI-friendly API contract verification script.
 *
 * Unlike the scriptRunner-based version, this script:
 * - Does not pull env vars from Vercel (expects them to be set in CI)
 * - Does not require a database connection
 * - Exits with appropriate status codes for CI
 *
 * Required environment variables:
 * - FLOWGLAD_PROD_API_KEY: API key for the Flowglad production instance
 * - FLOWGLAD_PROD_API_URL: Base URL of the Flowglad instance to test against
 *
 * Usage:
 *   bunx tsx src/scripts/verifyApiContractCI.ts
 */

const requiredEnvVars = [
  'FLOWGLAD_PROD_API_KEY',
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

// Map CI env vars to the names expected by the underlying client
// This must happen before importing any modules that read these env vars
process.env.NEXT_PUBLIC_APP_URL = process.env.FLOWGLAD_PROD_API_URL
process.env.TELEMETRY_TEST_API_KEY = process.env.FLOWGLAD_PROD_API_KEY

const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
}

// Use async IIFE with dynamic import so env vars are set before modules load
;(async () => {
  const { default: verifyApiContract } = await import(
    '@/api-contract/verify'
  )

  try {
    await verifyApiContract(logger)
    console.log('✅ API contract verification passed')
    process.exit(0)
  } catch (error) {
    console.error('❌ API contract verification failed:', error)
    process.exit(1)
  }
})()
