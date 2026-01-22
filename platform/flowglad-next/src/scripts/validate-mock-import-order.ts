#!/usr/bin/env bun
/**
 * Validates that bun.mocks.ts is imported first in bun.setup.ts
 *
 * This is critical because mock.module() calls must precede any imports that
 * transitively load the mocked modules. The bun.mocks.ts file contains all
 * mock registrations, and must be imported before any other non-type imports.
 */

import fs from 'node:fs'
import path from 'node:path'

const SETUP_FILE = path.resolve(__dirname, '../../bun.setup.ts')
const MOCKS_IMPORT = './bun.mocks'

// Regex to match import statements (excluding type-only imports)
const importRegex =
  /^import\s+(?!type\s)(?:(?:\{[^}]*\}|[\w*]+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?\s+from\s+)?['"]([^'"]+)['"]/gm

function validateMockImportOrder(): boolean {
  const content = fs.readFileSync(SETUP_FILE, 'utf-8')

  // Find all non-type imports
  const imports: Array<{
    match: string
    source: string
    index: number
  }> = []
  let match: RegExpExecArray | null

  while ((match = importRegex.exec(content)) !== null) {
    imports.push({
      match: match[0],
      source: match[1],
      index: match.index,
    })
  }

  if (imports.length === 0) {
    console.error('❌ No imports found in bun.setup.ts')
    return false
  }

  // The first import must be './bun.mocks'
  const firstImport = imports[0]
  if (firstImport.source !== MOCKS_IMPORT) {
    console.error(
      '❌ bun.mocks.ts must be imported first in bun.setup.ts'
    )
    console.error(
      `   Found: import from '${firstImport.source}' as first import`
    )
    console.error(
      `   Expected: import '${MOCKS_IMPORT}' as first import`
    )
    console.error('')
    console.error(
      '   Mock module registration must happen before any imports that could'
    )
    console.error('   transitively load the mocked modules.')
    return false
  }

  console.log('✅ Mock import order validation passed!')
  return true
}

const isValid = validateMockImportOrder()
process.exit(isValid ? 0 : 1)
