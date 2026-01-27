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

// Run bun test with NODE_ENV=test so db-safety-preload.ts uses .env.test
const proc = Bun.spawn(
  ['bun', 'test', ...preloadArgs, ...extraArgs, ...filePaths],
  {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, NODE_ENV: 'test' },
  }
)

process.exit(await proc.exited)
