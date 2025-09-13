#!/usr/bin/env tsx

/**
 * Telemetry Verification Script (Simplified for CI)
 *
 * This script tests all the telemetry improvements made to the REST API.
 * Designed to work without external dependencies like chalk.
 */

const API_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:3000/api/v1'
const TEST_API_KEY = process.env.TELEMETRY_TEST_API_KEY || ''

// Debug logging for CI
console.log('\n=== Telemetry Test Configuration ===')
console.log(`API Base URL: ${API_BASE_URL}`)
console.log(`API Key Set: ${TEST_API_KEY ? 'YES' : 'NO'}`)
if (TEST_API_KEY) {
  const keyPreview =
    TEST_API_KEY.length > 20
      ? `${TEST_API_KEY.substring(0, 10)}...${TEST_API_KEY.substring(TEST_API_KEY.length - 4)}`
      : 'KEY_TOO_SHORT'
  console.log(`API Key Preview: ${keyPreview}`)
  console.log(`API Key Length: ${TEST_API_KEY.length}`)
  console.log(
    `API Key starts with 'sk_': ${TEST_API_KEY.startsWith('sk_')}`
  )
  console.log(
    `API Key starts with 'staging_sk_': ${TEST_API_KEY.startsWith('staging_sk_')}`
  )
}
console.log('===================================\n')

interface TestResult {
  name: string
  passed: boolean
  details?: string
}

class TelemetryVerifier {
  private results: TestResult[] = []
  private hasValidKey: boolean = false

  async runAllTests(): Promise<boolean> {
    console.log(
      '\n🔬 Running REST API Telemetry Verification Tests\n'
    )

    // First, check if we have a valid API key
    await this.checkApiKeyValidity()

    // Run tests
    await this.testAuthenticationTelemetry()
    await this.testRoutingTelemetry()
    await this.testErrorTelemetry()
    await this.testPerformanceTelemetry()
    await this.testSecurityTelemetry()

    return this.printResults()
  }

  async checkApiKeyValidity() {
    console.log('🔑 Checking API Key Validity...')

    if (!TEST_API_KEY) {
      console.log(
        '  ⚠️  No API key provided - expecting all tests to return 401'
      )
      this.hasValidKey = false
      return
    }

    try {
      console.log(
        `  Testing key with endpoint: ${API_BASE_URL}/utils/ping`
      )
      const response = await fetch(`${API_BASE_URL}/utils/ping`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      })

      console.log(`  Response status: ${response.status}`)

      if (response.status === 200) {
        console.log('  ✅ API key is valid')
        this.hasValidKey = true

        // Show response for successful auth too
        const responseText = await response
          .text()
          .catch(() => 'Could not read response')
        console.log(`  Response: ${responseText.substring(0, 200)}`)
      } else {
        console.log(
          `  ❌ API key is invalid (status: ${response.status})`
        )
        const responseText = await response
          .text()
          .catch(() => 'Could not read response')
        console.log(
          `  Response body: ${responseText.substring(0, 500)}`
        )

        // Additional debug for headers
        const headers: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          headers[key] = value
        })
        console.log(
          `  Response headers: ${JSON.stringify(headers, null, 2)}`
        )

        if (response.status === 401) {
          console.log('\n  🔍 Authentication Failure Diagnosis:')
          console.log('  Possible causes:')
          console.log('    1. API key is invalid or expired in Unkey')
          console.log(
            '    2. Server missing UNKEY_ROOT_KEY environment variable'
          )
          console.log(
            '    3. Server missing UNKEY_API_ID environment variable'
          )
          console.log(
            '    4. API key prefix mismatch (staging vs production)'
          )
          console.log('')
          console.log('  Check the CI logs above for:')
          console.log(
            '    - "Loading environment variables from .env.local..." message'
          )
          console.log(
            '    - "Debug: UNKEY_ROOT_KEY is set/not set" message'
          )
          console.log(
            '    - "Debug: UNKEY_API_ID is set/not set" message'
          )
          console.log(
            '    - API key prefix (should match environment)'
          )
        }

        this.hasValidKey = false
      }
    } catch (error) {
      console.log(`  ❌ Error checking API key: ${error}`)
      this.hasValidKey = false
    }

    console.log()
  }

  async testAuthenticationTelemetry() {
    console.log('📋 Testing Authentication Telemetry...')

    // Test 1: Missing Authorization Header
    await this.testCase({
      name: 'Missing Authorization Header',
      test: async () => {
        const response = await fetch(`${API_BASE_URL}/products`, {
          method: 'GET',
        })
        return {
          passed: response.status === 401,
          details: `Status: ${response.status}`,
        }
      },
    })

    // Test 2: Invalid API Key Format
    await this.testCase({
      name: 'Invalid API Key Format',
      test: async () => {
        const response = await fetch(`${API_BASE_URL}/products`, {
          method: 'GET',
          headers: {
            Authorization: 'Bearer', // Missing key
          },
        })
        return {
          passed: response.status === 401,
          details: `Status: ${response.status}`,
        }
      },
    })
  }

  async testRoutingTelemetry() {
    console.log('\n📋 Testing Routing Telemetry...')

    // Only run these tests if we have a valid key
    if (!this.hasValidKey) {
      console.log('  ⏭️  Skipping routing tests (no valid API key)')
      return
    }

    // Test: Known Route
    await this.testCase({
      name: 'Known Route Matching',
      test: async () => {
        const response = await fetch(`${API_BASE_URL}/products`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        })
        return {
          passed: response.status !== 404,
          details: `Status: ${response.status}`,
        }
      },
    })

    // Test: Unknown Route
    await this.testCase({
      name: 'Unknown Route (404)',
      test: async () => {
        const response = await fetch(
          `${API_BASE_URL}/nonexistent-endpoint`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${TEST_API_KEY}`,
            },
          }
        )
        return {
          passed: response.status === 404,
          details: `Status: ${response.status}`,
        }
      },
    })
  }

  async testErrorTelemetry() {
    console.log('\n📋 Testing Error Telemetry...')

    if (!this.hasValidKey) {
      console.log('  ⏭️  Skipping error tests (no valid API key)')
      return
    }

    // Test: Invalid JSON Body
    await this.testCase({
      name: 'Invalid JSON Body',
      test: async () => {
        const response = await fetch(`${API_BASE_URL}/products`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: 'invalid json {',
        })
        return {
          passed: response.status === 400,
          details: `Status: ${response.status}`,
        }
      },
    })
  }

  async testPerformanceTelemetry() {
    console.log('\n📋 Testing Performance Telemetry...')

    // Test: Request Performance
    await this.testCase({
      name: 'Request Performance',
      test: async () => {
        const startTime = Date.now()
        const response = await fetch(`${API_BASE_URL}/utils/ping`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        })
        const duration = Date.now() - startTime

        const expectedStatus = this.hasValidKey ? 200 : 401
        return {
          passed:
            response.status === expectedStatus && duration < 5000,
          details: `Status: ${response.status}, Duration: ${duration}ms`,
        }
      },
    })
  }

  async testSecurityTelemetry() {
    console.log('\n📋 Testing Security Telemetry...')

    // Test: Multiple Failed Auth Attempts
    await this.testCase({
      name: 'Multiple Failed Auth Attempts',
      test: async () => {
        const invalidKey = `sk_test_invalid_${Date.now()}`

        // Make 6 failed attempts
        for (let i = 0; i < 6; i++) {
          const response = await fetch(`${API_BASE_URL}/products`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${invalidKey}`,
            },
          })
          if (response.status !== 401) {
            return {
              passed: false,
              details: `Attempt ${i + 1} returned ${response.status} instead of 401`,
            }
          }
        }

        return {
          passed: true,
          details: `All 6 attempts correctly rejected with 401`,
        }
      },
    })
  }

  private async testCase(config: {
    name: string
    test: () => Promise<{ passed: boolean; details?: string }>
  }) {
    try {
      const result = await config.test()
      this.results.push({
        name: config.name,
        ...result,
      })

      const icon = result.passed ? '✓' : '✗'
      console.log(`  ${icon} ${config.name}`)
      if (result.details) {
        console.log(`    ${result.details}`)
      }
    } catch (error) {
      this.results.push({
        name: config.name,
        passed: false,
        details: `Error: ${(error as Error).message}`,
      })
      console.log(`  ✗ ${config.name}`)
      console.log(`    Error: ${(error as Error).message}`)
    }
  }

  private printResults(): boolean {
    console.log('\n📊 Test Results Summary\n')

    const passed = this.results.filter((r) => r.passed).length
    const failed = this.results.filter((r) => !r.passed).length
    const total = this.results.length

    console.log(`  Passed: ${passed}/${total}`)
    if (failed > 0) {
      console.log(`  Failed: ${failed}/${total}`)
    }

    const passRate = ((passed / total) * 100).toFixed(1)
    console.log(`\n  Pass Rate: ${passRate}%`)

    if (failed > 0) {
      console.log('\n  Failed Tests:')
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`    - ${r.name}`)
          if (r.details) {
            console.log(`      ${r.details}`)
          }
        })
    }

    console.log('\n✨ Telemetry Verification Complete!\n')

    // Important note about API key
    if (!this.hasValidKey) {
      console.log('⚠️  Note: No valid API key was provided.')
      console.log(
        '   Some tests were skipped to avoid false failures.'
      )
      console.log(
        '   To test all features, set TELEMETRY_TEST_API_KEY to a valid key.\n'
      )
    }

    // Return success only if ALL tests pass (100%)
    return passed === total
  }
}

// Run the tests
async function main() {
  try {
    const verifier = new TelemetryVerifier()
    const success = await verifier.runAllTests()

    if (!success) {
      console.log('❌ Telemetry verification failed!')
      process.exit(1)
    } else {
      console.log('✅ Telemetry verification passed!')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Test execution failed:', error)
    process.exit(1)
  }
}

main()
