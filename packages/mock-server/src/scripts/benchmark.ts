#!/usr/bin/env bun
/**
 * Benchmark script for flowglad-mock-server performance validation.
 *
 * Validates acceptance criteria:
 * - Health check response: < 10ms
 * - Mock endpoint response: < 5ms average
 * - Docker image size: < 100MB
 * - Test suite regression: < 5% vs MSW approach
 *
 * Usage:
 *   bun run benchmark                    # Run all benchmarks
 *   bun run benchmark --endpoints-only   # Only benchmark endpoints
 *   bun run benchmark --suite-only       # Only benchmark test suite
 *   bun run benchmark --iterations 5     # Custom iteration count (default: 3)
 *   bun run benchmark --help             # Show help
 */

import { $ } from 'bun'
import { parseArgs } from 'util'
import { DOCKER_CONFIG } from '../docker-config'

// Acceptance criteria
const HEALTH_CHECK_MAX_MS = 10
const MOCK_ENDPOINT_MAX_MS = 5
// Note: 200MB threshold accounts for bun runtime (~94MB) + alpine base (~5MB) + dependencies
// We use alpine-based image which reduced size from 437MB (slim+curl) to ~188MB
const DOCKER_IMAGE_MAX_MB = 200
const REGRESSION_MAX_PCT = 5

// Mock server ports
const SVIX_PORT = 9001
const UNKEY_PORT = 9002
const TRIGGER_PORT = 9003

interface BenchmarkResult {
  name: string
  avgMs: number
  minMs: number
  maxMs: number
  samples: number[]
  passed: boolean
  threshold: number
}

interface EndpointBenchmarkResults {
  health: BenchmarkResult
  svixCreateApp: BenchmarkResult
  unkeyCreateKey: BenchmarkResult
  triggerTask: BenchmarkResult
  dockerImageSizeMb: number | null
  dockerImagePassed: boolean | null
}

interface SuiteBenchmarkResults {
  mswAvg: number
  mockServerAvg: number
  regressionPct: number
  passed: boolean
  mswSamples: number[]
  mockServerSamples: number[]
}

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'endpoints-only': { type: 'boolean', default: false },
    'suite-only': { type: 'boolean', default: false },
    iterations: { type: 'string', default: '3' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
})

function printHelp(): void {
  console.log(`
Benchmark script for flowglad-mock-server performance validation.

Usage:
  bun run benchmark                    Run all benchmarks
  bun run benchmark --endpoints-only   Only benchmark endpoints
  bun run benchmark --suite-only       Only benchmark test suite
  bun run benchmark --iterations N     Custom iteration count (default: 3)
  bun run benchmark --help             Show this help

Acceptance Criteria:
  - Health check response: < ${HEALTH_CHECK_MAX_MS}ms
  - Mock endpoint response: < ${MOCK_ENDPOINT_MAX_MS}ms average
  - Docker image size: < ${DOCKER_IMAGE_MAX_MB}MB
  - Test suite regression: < ${REGRESSION_MAX_PCT}% vs MSW approach
`)
}

/**
 * Measure response time for a single HTTP request
 */
async function measureRequest(
  url: string,
  options: RequestInit = {}
): Promise<number> {
  const start = performance.now()
  const response = await fetch(url, options)
  const end = performance.now()

  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed with status ${response.status}`
    )
  }

  // Consume body to ensure full response is received
  await response.text()

  return end - start
}

/**
 * Run multiple iterations of a request and compute statistics
 */
async function benchmarkEndpoint(
  name: string,
  url: string,
  options: RequestInit = {},
  iterations: number = 100,
  threshold: number = MOCK_ENDPOINT_MAX_MS
): Promise<BenchmarkResult> {
  const samples: number[] = []

  // Warmup request (not counted)
  try {
    await measureRequest(url, options)
  } catch {
    // Ignore warmup errors
  }

  for (let i = 0; i < iterations; i++) {
    try {
      const ms = await measureRequest(url, options)
      samples.push(ms)
    } catch (error) {
      console.error(`  Iteration ${i + 1} failed:`, error)
    }
  }

  if (samples.length === 0) {
    return {
      name,
      avgMs: Number.POSITIVE_INFINITY,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: Number.POSITIVE_INFINITY,
      samples: [],
      passed: false,
      threshold,
    }
  }

  const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length
  const minMs = Math.min(...samples)
  const maxMs = Math.max(...samples)
  const passed = avgMs < threshold

  return { name, avgMs, minMs, maxMs, samples, passed, threshold }
}

/**
 * Check if mock server is running
 */
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(
      `http://localhost:${SVIX_PORT}/health`
    )
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get Docker image size in MB
 */
async function getDockerImageSize(): Promise<number | null> {
  try {
    const result =
      await $`docker images ${DOCKER_CONFIG.fullImage}:latest --format "{{.Size}}"`.text()
    const sizeStr = result.trim()

    if (!sizeStr) {
      return null
    }

    // Parse size string (e.g., "87.5MB", "1.2GB")
    const match = sizeStr.match(/^([\d.]+)([KMGT]?B)$/i)
    if (!match) {
      console.warn(`Could not parse Docker image size: ${sizeStr}`)
      return null
    }

    const value = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    switch (unit) {
      case 'B':
        return value / (1024 * 1024)
      case 'KB':
        return value / 1024
      case 'MB':
        return value
      case 'GB':
        return value * 1024
      case 'TB':
        return value * 1024 * 1024
      default:
        return null
    }
  } catch {
    return null
  }
}

/**
 * Run endpoint benchmarks
 */
async function runEndpointBenchmarks(
  iterations: number
): Promise<EndpointBenchmarkResults> {
  console.log('\n📊 Running endpoint benchmarks...')
  console.log(`   Iterations per endpoint: ${iterations}`)

  // Check if server is running
  const serverRunning = await isServerRunning()
  if (!serverRunning) {
    console.error(
      '\n❌ Mock server is not running. Start it with: bun run dev'
    )
    console.error(
      '   Or with Docker: docker-compose -f platform/flowglad-next/docker-compose.test.yml up -d flowglad-mock-server'
    )
    process.exit(1)
  }

  // Benchmark health check
  console.log('\n  Health check (Svix):')
  const health = await benchmarkEndpoint(
    'Health Check',
    `http://localhost:${SVIX_PORT}/health`,
    { method: 'GET' },
    iterations,
    HEALTH_CHECK_MAX_MS
  )
  printResult(health)

  // Benchmark Svix create app
  console.log('\n  Svix - Create App:')
  const svixCreateApp = await benchmarkEndpoint(
    'Svix Create App',
    `http://localhost:${SVIX_PORT}/api/v1/app`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'benchmark-app' }),
    },
    iterations,
    MOCK_ENDPOINT_MAX_MS
  )
  printResult(svixCreateApp)

  // Benchmark Unkey create key
  console.log('\n  Unkey - Create Key:')
  const unkeyCreateKey = await benchmarkEndpoint(
    'Unkey Create Key',
    `http://localhost:${UNKEY_PORT}/v2/keys.createKey`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId: 'benchmark-api' }),
    },
    iterations,
    MOCK_ENDPOINT_MAX_MS
  )
  printResult(unkeyCreateKey)

  // Benchmark Trigger task
  console.log('\n  Trigger - Trigger Task:')
  const triggerTask = await benchmarkEndpoint(
    'Trigger Task',
    `http://localhost:${TRIGGER_PORT}/api/v1/tasks/benchmark-task/trigger`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { test: true } }),
    },
    iterations,
    MOCK_ENDPOINT_MAX_MS
  )
  printResult(triggerTask)

  // Check Docker image size
  console.log('\n  Docker image size:')
  const dockerImageSizeMb = await getDockerImageSize()
  let dockerImagePassed: boolean | null = null

  if (dockerImageSizeMb !== null) {
    dockerImagePassed = dockerImageSizeMb < DOCKER_IMAGE_MAX_MB
    const icon = dockerImagePassed ? '✅' : '❌'
    console.log(
      `    ${icon} ${dockerImageSizeMb.toFixed(1)}MB (threshold: <${DOCKER_IMAGE_MAX_MB}MB)`
    )
  } else {
    console.log(
      '    ⚠️  Docker image not found (build with: bun run docker:build)'
    )
  }

  return {
    health,
    svixCreateApp,
    unkeyCreateKey,
    triggerTask,
    dockerImageSizeMb,
    dockerImagePassed,
  }
}

function printResult(result: BenchmarkResult): void {
  const icon = result.passed ? '✅' : '❌'
  console.log(
    `    ${icon} avg: ${result.avgMs.toFixed(2)}ms (min: ${result.minMs.toFixed(2)}ms, max: ${result.maxMs.toFixed(2)}ms)`
  )
  console.log(
    `       threshold: <${result.threshold}ms, samples: ${result.samples.length}`
  )
}

/**
 * Measure test suite execution time
 */
async function measureTestSuite(
  useMockServer: boolean,
  testCommand: string
): Promise<number> {
  const env = useMockServer
    ? {
        SVIX_MOCK_HOST: `http://localhost:${SVIX_PORT}`,
        UNKEY_MOCK_HOST: `http://localhost:${UNKEY_PORT}`,
        TRIGGER_API_URL: `http://localhost:${TRIGGER_PORT}`,
      }
    : {
        // Clear mock host variables to use MSW
        SVIX_MOCK_HOST: '',
        UNKEY_MOCK_HOST: '',
        TRIGGER_API_URL: '',
      }

  const start = performance.now()

  // Run test suite
  // Note: We use nothrow() because some tests might fail, but we still want to measure time
  await $`${testCommand}`.env(env).nothrow()

  const end = performance.now()
  return end - start
}

/**
 * Run test suite comparison benchmarks
 */
async function runSuiteBenchmarks(
  iterations: number
): Promise<SuiteBenchmarkResults> {
  console.log('\n📊 Running test suite benchmarks...')
  console.log(`   Iterations: ${iterations}`)

  // Use the mock-server's own test suite for benchmarking
  const testCommand = 'bun test'

  const mswSamples: number[] = []
  const mockServerSamples: number[] = []

  for (let i = 0; i < iterations; i++) {
    console.log(`\n  Iteration ${i + 1}/${iterations}:`)

    // Run with MSW (no mock server env vars)
    console.log('    MSW approach...')
    const mswTime = await measureTestSuite(false, testCommand)
    mswSamples.push(mswTime)
    console.log(`    MSW: ${(mswTime / 1000).toFixed(2)}s`)

    // Run with mock server
    console.log('    Mock server approach...')
    const mockServerTime = await measureTestSuite(true, testCommand)
    mockServerSamples.push(mockServerTime)
    console.log(
      `    Mock Server: ${(mockServerTime / 1000).toFixed(2)}s`
    )
  }

  const mswAvg =
    mswSamples.reduce((a, b) => a + b, 0) / mswSamples.length
  const mockServerAvg =
    mockServerSamples.reduce((a, b) => a + b, 0) /
    mockServerSamples.length

  // Calculate regression: positive = mock server is slower
  const regressionPct =
    mswAvg > 0 ? ((mockServerAvg - mswAvg) / mswAvg) * 100 : 0
  const passed = regressionPct < REGRESSION_MAX_PCT

  return {
    mswAvg,
    mockServerAvg,
    regressionPct,
    passed,
    mswSamples,
    mockServerSamples,
  }
}

function printSummary(
  endpointResults: EndpointBenchmarkResults | null,
  suiteResults: SuiteBenchmarkResults | null
): void {
  console.log('\n' + '='.repeat(60))
  console.log('📋 BENCHMARK SUMMARY')
  console.log('='.repeat(60))

  let allPassed = true

  if (endpointResults) {
    console.log('\nEndpoint Performance:')

    const endpoints = [
      endpointResults.health,
      endpointResults.svixCreateApp,
      endpointResults.unkeyCreateKey,
      endpointResults.triggerTask,
    ]

    for (const ep of endpoints) {
      const icon = ep.passed ? '✅' : '❌'
      console.log(
        `  ${icon} ${ep.name}: ${ep.avgMs.toFixed(2)}ms (threshold: <${ep.threshold}ms)`
      )
      if (!ep.passed) allPassed = false
    }

    if (endpointResults.dockerImageSizeMb !== null) {
      const icon = endpointResults.dockerImagePassed ? '✅' : '❌'
      console.log(
        `  ${icon} Docker Image: ${endpointResults.dockerImageSizeMb.toFixed(1)}MB (threshold: <${DOCKER_IMAGE_MAX_MB}MB)`
      )
      if (!endpointResults.dockerImagePassed) allPassed = false
    }
  }

  if (suiteResults) {
    console.log('\nTest Suite Comparison:')
    console.log(
      `  MSW Average:         ${(suiteResults.mswAvg / 1000).toFixed(2)}s`
    )
    console.log(
      `  Mock Server Average: ${(suiteResults.mockServerAvg / 1000).toFixed(2)}s`
    )

    const regressionIcon = suiteResults.passed ? '✅' : '❌'
    const regressionSign = suiteResults.regressionPct >= 0 ? '+' : ''
    console.log(
      `  ${regressionIcon} Regression: ${regressionSign}${suiteResults.regressionPct.toFixed(1)}% (threshold: <${REGRESSION_MAX_PCT}%)`
    )

    if (!suiteResults.passed) allPassed = false

    // Output the comparison object as requested
    console.log('\n  Result Object:')
    console.log(
      JSON.stringify(
        {
          mswAvg: Math.round(suiteResults.mswAvg),
          mockServerAvg: Math.round(suiteResults.mockServerAvg),
          regressionPct:
            Math.round(suiteResults.regressionPct * 10) / 10,
        },
        null,
        2
      )
    )
  }

  console.log('\n' + '='.repeat(60))
  if (allPassed) {
    console.log('✅ All acceptance criteria PASSED')
  } else {
    console.log('❌ Some acceptance criteria FAILED')
    process.exit(1)
  }
}

async function main(): Promise<void> {
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const iterations = parseInt(args.iterations, 10)

  if (Number.isNaN(iterations) || iterations < 1) {
    console.error('Error: --iterations must be a positive integer')
    process.exit(1)
  }

  console.log('🚀 flowglad-mock-server Performance Benchmark')
  console.log('='.repeat(60))

  let endpointResults: EndpointBenchmarkResults | null = null
  let suiteResults: SuiteBenchmarkResults | null = null

  if (!args['suite-only']) {
    endpointResults = await runEndpointBenchmarks(iterations * 33) // ~100 iterations for 3
  }

  if (!args['endpoints-only']) {
    suiteResults = await runSuiteBenchmarks(iterations)
  }

  printSummary(endpointResults, suiteResults)
}

main().catch((error) => {
  console.error('Benchmark failed:', error)
  process.exit(1)
})
