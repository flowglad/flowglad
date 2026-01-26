/**
 * Environment Boundaries Tests
 *
 * These tests verify that the test suite enforces proper environment boundaries:
 * - Unit tests should not import database transaction functions directly
 * - Unit tests should complete within timeout limits
 * - Integration tests are properly configured for real API access
 */

import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve(__dirname, '..')
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const TRANSACTION_IMPORT_PATTERNS = [
  /import.*adminTransaction/,
  /import.*authenticatedTransaction/,
  /from\s+['"]@\/db\/adminTransaction['"]/,
  /from\s+['"]@\/db\/authenticatedTransaction['"]/,
]

// This file's name - we exclude it from scanning since it contains the patterns as strings
const THIS_FILE = 'environmentBoundaries.unit.test.ts'

function findUnitTestFiles(dir: string): string[] {
  const files: string[] = []

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          walk(fullPath)
        }
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.unit.test.ts') &&
        entry.name !== THIS_FILE
      ) {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files
}

function checkFileForTransactionImports(filePath: string): {
  hasImports: boolean
  matches: string[]
} {
  const content = fs.readFileSync(filePath, 'utf-8')
  const matches: string[] = []

  for (const pattern of TRANSACTION_IMPORT_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      matches.push(match[0])
    }
  }

  return {
    hasImports: matches.length > 0,
    matches,
  }
}

describe('Environment boundaries', () => {
  describe('unit tests (*.unit.test.ts)', () => {
    it('should not import adminTransaction or authenticatedTransaction directly', () => {
      const unitTestFiles = findUnitTestFiles(SRC_DIR)
      const violations: Array<{ file: string; matches: string[] }> =
        []

      for (const file of unitTestFiles) {
        const result = checkFileForTransactionImports(file)
        if (result.hasImports) {
          violations.push({
            file: path.relative(PROJECT_ROOT, file),
            matches: result.matches,
          })
        }
      }

      expect(violations).toEqual([])
    })

    it('should use bun.unit.setup.ts which blocks database access at runtime', () => {
      const setupPath = path.join(PROJECT_ROOT, 'bun.unit.setup.ts')
      const content = fs.readFileSync(setupPath, 'utf-8')

      // Verify that the setup file blocks database imports
      expect(content).toMatch(/mock\.module\(['"]@\/db\/client['"]/)
      expect(content).toMatch(
        /mock\.module\(['"]@\/db\/adminTransaction['"]/
      )
      expect(content).toMatch(
        /mock\.module\(['"]@\/db\/authenticatedTransaction['"]/
      )
      expect(content).toMatch(
        /Database access is blocked in unit tests/
      )
    })
  })

  describe('integration tests (*.integration.test.ts)', () => {
    it('are allowed to use real database transactions by design', () => {
      const integrationSetupPath = path.join(
        PROJECT_ROOT,
        'bun.integration.setup.ts'
      )
      const content = fs.readFileSync(integrationSetupPath, 'utf-8')

      // Integration tests should NOT block database access
      expect(content).not.toMatch(
        /mock\.module\(['"]@\/db\/adminTransaction['"].*throw/
      )

      // Integration tests should enable real Stripe and Redis
      expect(content).toMatch(/STRIPE_INTEGRATION_TEST_MODE/)
      expect(content).toMatch(/REDIS_INTEGRATION_TEST_MODE/)
    })

    it('should run with extended timeout (30000ms) for real API calls', () => {
      const packageJsonPath = path.join(PROJECT_ROOT, 'package.json')
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf-8')
      )

      // Check that integration test script has --timeout 30000
      const integrationScript =
        packageJson.scripts['test:integration']
      expect(integrationScript).toMatch(/--timeout 30000/)
    })
  })

  describe('db tests (*.db.test.ts)', () => {
    it('should use bun.db.test.setup.ts with transaction isolation', () => {
      const setupPath = path.join(
        PROJECT_ROOT,
        'bun.db.test.setup.ts'
      )
      const content = fs.readFileSync(setupPath, 'utf-8')

      // Verify savepoint-based isolation is configured
      expect(content).toMatch(/savepoint|transaction/i)
    })
  })

  describe('bunfig.toml configuration', () => {
    it('should have timeout enforcement configured for unit tests', () => {
      const bunfigPath = path.join(PROJECT_ROOT, 'bunfig.toml')
      const content = fs.readFileSync(bunfigPath, 'utf-8')

      // Verify timeout is set
      expect(content).toMatch(/timeout\s*=\s*5000/)
    })
  })
})
