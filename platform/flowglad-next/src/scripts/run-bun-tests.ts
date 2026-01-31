#!/usr/bin/env bun
/**
 * Test runner that finds files by pattern and runs them with the correct setup.
 *
 * Why this exists (instead of raw `bun test`):
 * - Gracefully exits 0 when no files match (bun would run ALL tests instead)
 * - Ensures only intended test files run with each setup file
 * - Supports sharding for parallel test execution
 *
 * Usage: bun run src/scripts/run-bun-tests.ts <setup-file> <pattern> [options...]
 *
 * Options:
 *   --shard <index>/<total>  Run only a portion of tests (e.g., --shard 1/4)
 *   --list                   List files that would run without executing tests
 *   [other options]          Passed through to bun test (e.g., --timeout)
 *
 * Examples:
 *   # Run all db tests
 *   bun run src/scripts/run-bun-tests.ts ./bun.db.test.setup.ts '*.db.test.ts'
 *
 *   # Run shard 2 of 4 for db tests
 *   bun run src/scripts/run-bun-tests.ts ./bun.db.test.setup.ts '*.db.test.ts' --shard 2/4
 *
 *   # List files in shard 1 of 4 without running
 *   bun run src/scripts/run-bun-tests.ts ./bun.db.test.setup.ts '*.db.test.ts' --shard 1/4 --list
 */

import { $ } from 'bun'

interface ShardConfig {
  index: number
  total: number
}

function parseShardArg(args: string[]): {
  shard: ShardConfig | null
  remainingArgs: string[]
} {
  const shardIndex = args.findIndex((arg) => arg === '--shard')
  if (shardIndex === -1) {
    return { shard: null, remainingArgs: args }
  }

  const shardValue = args[shardIndex + 1]
  if (!shardValue || !shardValue.includes('/')) {
    console.error(
      'Error: --shard requires format <index>/<total> (e.g., --shard 1/4)'
    )
    process.exit(1)
  }

  const [indexStr, totalStr] = shardValue.split('/')
  const index = parseInt(indexStr, 10)
  const total = parseInt(totalStr, 10)

  if (
    isNaN(index) ||
    isNaN(total) ||
    index < 1 ||
    total < 1 ||
    index > total
  ) {
    console.error(
      `Error: Invalid shard ${shardValue}. Index must be 1-${total}, total must be >= 1`
    )
    process.exit(1)
  }

  // Remove --shard and its value from args
  const remainingArgs = [
    ...args.slice(0, shardIndex),
    ...args.slice(shardIndex + 2),
  ]
  return { shard: { index, total }, remainingArgs }
}

function getShardFiles(
  files: string[],
  shard: ShardConfig
): string[] {
  // Sort files deterministically for consistent sharding across runs
  const sortedFiles = [...files].sort()

  const shardSize = Math.ceil(sortedFiles.length / shard.total)
  const start = (shard.index - 1) * shardSize
  const end = Math.min(start + shardSize, sortedFiles.length)

  return sortedFiles.slice(start, end)
}

const args = process.argv.slice(2)

if (args.length < 2) {
  console.error(
    'Usage: run-bun-tests.ts <setup-file> <pattern> [--shard <index>/<total>] [--list] [options...]'
  )
  process.exit(1)
}

const setupFile = args[0]
const pattern = args[1]

// Parse shard argument
const { shard, remainingArgs } = parseShardArg(args.slice(2))

// Check for --list flag
const listOnly = remainingArgs.includes('--list')
const extraArgs = remainingArgs.filter((arg) => arg !== '--list')

// Always search in src/
const searchDir = 'src'

// Find test files using Bun Shell
const result = await $`find ${searchDir} -name ${pattern} -type f`
  .nothrow()
  .text()
let files = result
  .trim()
  .split('\n')
  .filter((f) => f.length > 0)

if (files.length === 0) {
  console.log(`No ${pattern} files found in ${searchDir}`)
  process.exit(0)
}

const totalFiles = files.length

// Apply sharding if specified
if (shard) {
  files = getShardFiles(files, shard)
  console.log(
    `Shard ${shard.index}/${shard.total}: ${files.length} of ${totalFiles} ${pattern} file(s)`
  )
} else {
  console.log(`Found ${files.length} ${pattern} file(s)`)
}

if (files.length === 0) {
  console.log('No files in this shard')
  process.exit(0)
}

// Prefix paths with './' so bun treats them as files, not filter patterns
const filePaths = files.map((f) =>
  f.startsWith('./') || f.startsWith('/') ? f : `./${f}`
)

// If --list flag, just print files and exit
if (listOnly) {
  console.log('\nFiles:')
  filePaths.forEach((f) => console.log(`  ${f}`))
  process.exit(0)
}

// Build preload arguments
// For frontend tests, we need the DOM preload to run BEFORE the setup file
// so that document is available when @testing-library/dom loads
const preloadArgs: string[] = []
if (setupFile.includes('frontend')) {
  preloadArgs.push('--preload', './bun.dom.preload.ts')
}
preloadArgs.push('--preload', setupFile)

// Determine NODE_ENV based on test type
// - Integration tests use NODE_ENV=integration to load .env.integration
// - All other tests use NODE_ENV=test to load .env.test
const nodeEnv = setupFile.includes('integration')
  ? 'integration'
  : 'test'

// Build environment for child process
// For non-integration tests, explicitly set mock server URLs to ensure tests
// don't accidentally use real services even if parent process has different values
const childEnv: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: nodeEnv,
}

if (nodeEnv === 'test') {
  // Explicitly set mock server URLs for test environment
  // This overrides any values inherited from the parent process
  childEnv.UPSTASH_REDIS_REST_URL = 'http://localhost:9004'
  childEnv.UPSTASH_REDIS_REST_TOKEN = 'test_secret_token'
  childEnv.TRIGGER_API_URL = 'http://localhost:9003'
  childEnv.SVIX_MOCK_HOST = 'http://localhost:9001'
  childEnv.UNKEY_MOCK_HOST = 'http://localhost:9002'
  childEnv.RESEND_BASE_URL = 'http://localhost:9005'
  childEnv.CLOUDFLARE_R2_ENDPOINT = 'http://localhost:9006'

  // Set Unkey credentials for test environment
  // These are required for SDK validation in tests
  // Set unconditionally to ensure tests have correct values
  childEnv.UNKEY_API_ID = 'api_test_mock'
  childEnv.UNKEY_ROOT_KEY = 'unkey_test_mock'

  // Stripe mock configuration
  // Set unconditionally to ensure tests use stripe-mock
  childEnv.STRIPE_MOCK_HOST = 'localhost'
  childEnv.STRIPE_SECRET_KEY = 'sk_test_stub'
  childEnv.STRIPE_TEST_MODE_SECRET_KEY = 'sk_test_stub'
}

// Run bun test with appropriate environment
const proc = Bun.spawn(
  ['bun', 'test', ...preloadArgs, ...extraArgs, ...filePaths],
  {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: childEnv,
  }
)

process.exit(await proc.exited)
