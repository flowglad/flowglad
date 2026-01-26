#!/usr/bin/env bun
/**
 * Test runner that finds files by pattern and runs them with the correct setup.
 *
 * Why this exists (instead of raw `bun test`):
 * - Gracefully exits 0 when no files match (bun would run ALL tests instead)
 * - Ensures only intended test files run with each setup file
 *
 * Usage: bun run src/scripts/run-bun-tests.ts <setup-file> <pattern> <dirs...> [options...]
 */

import { $ } from 'bun'

const args = process.argv.slice(2)

if (args.length < 3) {
  console.error(
    'Usage: run-bun-tests.ts <setup-file> <pattern> <dirs...> [options...]'
  )
  process.exit(1)
}

const setupFile = args[0]
const pattern = args[1]

// Parse remaining args - directories first, then options starting with --
const searchDirs: string[] = []
const extraArgs: string[] = []
let inOptions = false

for (let i = 2; i < args.length; i++) {
  const arg = args[i]
  if (arg.startsWith('--')) inOptions = true
  if (inOptions) extraArgs.push(arg)
  else searchDirs.push(arg)
}

if (searchDirs.length === 0) {
  console.error('Error: At least one search directory is required')
  process.exit(1)
}

// Find test files using Bun Shell
const files: string[] = []
for (const dir of searchDirs) {
  const result = await $`find ${dir} -name ${pattern} -type f`
    .nothrow()
    .text()
  files.push(
    ...result
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
  )
}

if (files.length === 0) {
  console.log(`No ${pattern} files found in ${searchDirs.join(', ')}`)
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
