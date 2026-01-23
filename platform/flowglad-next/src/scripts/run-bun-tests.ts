#!/usr/bin/env bun
/**
 * Test runner script that handles:
 * - Finding test files by pattern across multiple directories
 * - Gracefully skipping when no files match
 * - Running bun test with the correct preload file
 *
 * Usage: bun run src/scripts/run-bun-tests.ts <setup-file> <pattern> <search-dirs...> [-- bun test options...]
 *
 * Examples:
 *   bun run src/scripts/run-bun-tests.ts ./bun.unit.setup.ts '*.unit.test.ts' src
 *   bun run src/scripts/run-bun-tests.ts ./bun.dbtest.setup.ts '*.dbtest.ts' src --watch
 *   bun run src/scripts/run-bun-tests.ts ./bun.setup.ts '*.test.ts' src
 *   bun run src/scripts/run-bun-tests.ts ./bun.rls.setup.ts '*.rls.test.ts' integration-tests src --timeout 30000 --max-concurrency 1
 */

import { execSync, spawn } from 'child_process'

const args = process.argv.slice(2)

if (args.length < 3) {
  console.error(
    'Usage: bun run src/scripts/run-bun-tests.ts <setup-file> <pattern> <search-dirs...> [bun test options...]'
  )
  console.error(
    'Example: bun run src/scripts/run-bun-tests.ts ./bun.unit.setup.ts "*.unit.test.ts" src'
  )
  process.exit(1)
}

const setupFile = args[0]
const pattern = args[1]

// Parse remaining args - directories come first, then options starting with --
const searchDirs: string[] = []
const extraArgs: string[] = []
let inOptions = false

for (let i = 2; i < args.length; i++) {
  const arg = args[i]
  if (arg.startsWith('--')) {
    inOptions = true
  }
  if (inOptions) {
    extraArgs.push(arg)
  } else {
    searchDirs.push(arg)
  }
}

if (searchDirs.length === 0) {
  console.error('Error: At least one search directory is required')
  process.exit(1)
}

// Find test files across all directories
let files: string[] = []
for (const searchDir of searchDirs) {
  try {
    const findOutput = execSync(
      `find ${searchDir} -name '${pattern}' -type f`,
      { encoding: 'utf-8' }
    )
    const dirFiles = findOutput
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
    files = files.concat(dirFiles)
  } catch {
    // find command failed or returned empty for this directory - continue
  }
}

if (files.length === 0) {
  console.log(`No ${pattern} files found in ${searchDirs.join(', ')}`)
  process.exit(0)
}

console.log(
  `Found ${files.length} test file(s) matching ${pattern} in ${searchDirs.join(', ')}`
)

// Build bun test command
const bunArgs = [
  'test',
  '--preload',
  setupFile,
  ...extraArgs,
  ...files,
]

// Run bun test
const child = spawn('bun', bunArgs, {
  stdio: 'inherit',
  env: process.env,
})

child.on('close', (code) => {
  process.exit(code ?? 0)
})
