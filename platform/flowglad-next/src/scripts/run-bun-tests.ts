#!/usr/bin/env bun
/**
 * Test runner that finds files by pattern and runs them with the correct setup.
 *
 * Why this exists (instead of raw `bun test`):
 * - Gracefully exits 0 when no files match (bun would run ALL tests instead)
 * - Ensures only intended test files run with each setup file
 *
 * Usage: bun run src/scripts/run-bun-tests.ts <setup-file> <pattern> [options...]
 *
 * All tests are searched in src/ by default.
 */

import { $ } from 'bun'

const args = process.argv.slice(2)

if (args.length < 2) {
  console.error(
    'Usage: run-bun-tests.ts <setup-file> <pattern> [options...]'
  )
  process.exit(1)
}

const setupFile = args[0]
const pattern = args[1]

// Parse remaining args as options (starting with --)
const extraArgs = args.slice(2).filter((arg) => arg.startsWith('--'))

// Always search in src/
const searchDir = 'src'

// Find test files using Bun Shell
const result = await $`find ${searchDir} -name ${pattern} -type f`
  .nothrow()
  .text()
const files = result
  .trim()
  .split('\n')
  .filter((f) => f.length > 0)

if (files.length === 0) {
  console.log(`No ${pattern} files found in ${searchDir}`)
  process.exit(0)
}

console.log(`Found ${files.length} ${pattern} file(s)`)

// Prefix paths with './' so bun treats them as files, not filter patterns
const filePaths = files.map((f) =>
  f.startsWith('./') || f.startsWith('/') ? f : `./${f}`
)

// Run bun test
const proc = Bun.spawn(
  ['bun', 'test', '--preload', setupFile, ...extraArgs, ...filePaths],
  { stdio: ['inherit', 'inherit', 'inherit'] }
)

process.exit(await proc.exited)
