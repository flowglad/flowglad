#!/usr/bin/env bun
/**
 * Analyzes test files for resource requirements and isolation patterns.
 *
 * This script helps identify:
 * - Tests that import adminTransaction/authenticatedTransaction
 * - Tests that should be renamed based on their dependencies
 * - Tests that may be using external resources inappropriately
 *
 * Test file categories:
 * - *.unit.test.ts: Pure unit tests (no DB, strict mocking)
 * - *.db.test.ts: DB-backed tests (transaction-isolated)
 * - *.integration.test.ts: Integration tests (real external APIs)
 * - *.test.ts: Legacy backend tests (should be migrated)
 */

import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve(__dirname, '..')
const INTEGRATION_TESTS_DIR = path.resolve(
  __dirname,
  '../../integration-tests'
)
const RLS_TESTS_DIR = path.resolve(__dirname, '../../rls-tests')

interface TestFileAnalysis {
  file: string
  category:
    | 'unit'
    | 'dbtest'
    | 'integration'
    | 'rls'
    | 'frontend'
    | 'legacy'
  importsTransaction: boolean
  importsStripe: boolean
  importsRedis: boolean
  importsTrigger: boolean
  importsUnkey: boolean
  issues: string[]
}

type TestCategory =
  | 'unit'
  | 'dbtest'
  | 'integration'
  | 'rls'
  | 'frontend'
  | 'legacy'

const TRANSACTION_PATTERNS = [
  /import.*adminTransaction/,
  /import.*authenticatedTransaction/,
  /from\s+['"]@\/db\/adminTransaction['"]/,
  /from\s+['"]@\/db\/authenticatedTransaction['"]/,
]

const STRIPE_PATTERNS = [
  /import.*from\s+['"]stripe['"]/,
  /import.*from\s+['"]@\/utils\/stripe['"]/,
  /new\s+Stripe\(/,
]

// Patterns that indicate a module is properly mocked (safe for unit tests)
const STRIPE_MOCK_PATTERNS = [
  /mock\.module\s*\(\s*['"]stripe['"]/,
  /mock\.module\s*\(\s*['"]@\/utils\/stripe['"]/,
]

const REDIS_PATTERNS = [
  /import.*from\s+['"]@\/utils\/redis['"]/,
  /import.*from\s+['"]ioredis['"]/,
]

const TRIGGER_PATTERNS = [
  /import.*from\s+['"]@trigger\.dev/,
  /import.*from\s+['"]@\/trigger/,
]

const UNKEY_PATTERNS = [
  /import.*from\s+['"]@unkey/,
  /import.*from\s+['"]@\/utils\/unkey['"]/,
]

function getTestCategory(filePath: string): TestCategory {
  if (
    filePath.includes('integration-tests') ||
    filePath.endsWith('.integration.test.ts')
  ) {
    return 'integration'
  }
  if (filePath.endsWith('.unit.test.ts')) {
    return 'unit'
  }
  if (filePath.endsWith('.db.test.ts')) {
    return 'dbtest'
  }
  if (
    filePath.includes('rls-tests') ||
    filePath.endsWith('.rls.test.ts')
  ) {
    return 'rls'
  }
  // .tsx tests are frontend/React tests - their own category
  if (filePath.endsWith('.test.tsx')) {
    return 'frontend'
  }
  return 'legacy'
}

function matchesAnyPattern(
  content: string,
  patterns: RegExp[]
): boolean {
  return patterns.some((pattern) => pattern.test(content))
}

/**
 * Check if stripe imports are properly mocked via mock.module().
 * If both import and mock patterns are present, the import is considered safe.
 */
function isStripeProperyMocked(content: string): boolean {
  return matchesAnyPattern(content, STRIPE_MOCK_PATTERNS)
}

function findTestFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = []

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) {
      return
    }

    const entries = fs.readdirSync(currentDir, {
      withFileTypes: true,
    })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          walk(fullPath)
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files
}

// Files that contain pattern strings for testing purposes (false positives)
const ANALYSIS_SELF_TEST_FILES = [
  'environmentBoundaries.unit.test.ts',
]

function analyzeTestFile(filePath: string): TestFileAnalysis {
  const content = fs.readFileSync(filePath, 'utf-8')
  const category = getTestCategory(filePath)
  const issues: string[] = []
  const fileName = path.basename(filePath)

  // Skip pattern detection for files that test the patterns themselves
  const isSelfTestFile = ANALYSIS_SELF_TEST_FILES.includes(fileName)

  const importsTransaction = isSelfTestFile
    ? false
    : matchesAnyPattern(content, TRANSACTION_PATTERNS)
  const importsStripe = matchesAnyPattern(content, STRIPE_PATTERNS)
  const importsRedis = matchesAnyPattern(content, REDIS_PATTERNS)
  const importsTrigger = matchesAnyPattern(content, TRIGGER_PATTERNS)
  const importsUnkey = matchesAnyPattern(content, UNKEY_PATTERNS)

  // Check if stripe is properly mocked (safe for unit tests)
  const stripeIsMocked = isStripeProperyMocked(content)

  // Check for issues based on category
  if (category === 'unit') {
    if (importsTransaction) {
      issues.push(
        'Unit test imports transaction functions - should be *.db.test.ts'
      )
    }
    // Only flag stripe imports if they're NOT mocked
    if (importsStripe && !stripeIsMocked) {
      issues.push(
        'Unit test imports Stripe - should mock or use *.integration.test.ts'
      )
    }
    if (importsRedis) {
      issues.push(
        'Unit test imports Redis - should mock or use *.integration.test.ts'
      )
    }
  }

  if (category === 'legacy') {
    if (importsTransaction) {
      issues.push(
        'Legacy test uses transactions - migrate to *.db.test.ts'
      )
    }
    if (importsStripe || importsRedis || importsUnkey) {
      issues.push(
        'Legacy test uses external resources - migrate to appropriate category'
      )
    }
    issues.push(
      'Consider migrating to *.unit.test.ts or *.db.test.ts'
    )
  }

  return {
    file: path.relative(process.cwd(), filePath),
    category,
    importsTransaction,
    importsStripe,
    importsRedis,
    importsTrigger,
    importsUnkey,
    issues,
  }
}

function printReport(analyses: TestFileAnalysis[]) {
  // Category counts
  const categoryCounts = {
    unit: 0,
    dbtest: 0,
    integration: 0,
    rls: 0,
    frontend: 0,
    legacy: 0,
  }

  for (const analysis of analyses) {
    categoryCounts[analysis.category]++
  }

  console.log('\n=== Test File Categories ===\n')
  console.log(
    `  Unit tests (*.unit.test.ts):       ${categoryCounts.unit}`
  )
  console.log(
    `  DB tests (*.db.test.ts):           ${categoryCounts.dbtest}`
  )
  console.log(
    `  Integration tests:                 ${categoryCounts.integration}`
  )
  console.log(
    `  RLS tests:                         ${categoryCounts.rls}`
  )
  console.log(
    `  Frontend tests (*.test.tsx):       ${categoryCounts.frontend}`
  )
  console.log(
    `  Legacy tests (*.test.ts):          ${categoryCounts.legacy}`
  )
  console.log(
    `  Total:                             ${analyses.length}`
  )

  // External resource usage by category
  console.log('\n=== External Resource Usage by Category ===\n')

  const resourcesByCategory = {
    unit: {
      transaction: 0,
      stripe: 0,
      redis: 0,
      trigger: 0,
      unkey: 0,
    },
    dbtest: {
      transaction: 0,
      stripe: 0,
      redis: 0,
      trigger: 0,
      unkey: 0,
    },
    integration: {
      transaction: 0,
      stripe: 0,
      redis: 0,
      trigger: 0,
      unkey: 0,
    },
    rls: {
      transaction: 0,
      stripe: 0,
      redis: 0,
      trigger: 0,
      unkey: 0,
    },
    frontend: {
      transaction: 0,
      stripe: 0,
      redis: 0,
      trigger: 0,
      unkey: 0,
    },
    legacy: {
      transaction: 0,
      stripe: 0,
      redis: 0,
      trigger: 0,
      unkey: 0,
    },
  }

  for (const a of analyses) {
    if (a.importsTransaction)
      resourcesByCategory[a.category].transaction++
    if (a.importsStripe) resourcesByCategory[a.category].stripe++
    if (a.importsRedis) resourcesByCategory[a.category].redis++
    if (a.importsTrigger) resourcesByCategory[a.category].trigger++
    if (a.importsUnkey) resourcesByCategory[a.category].unkey++
  }

  console.log(
    '  Category      | Transaction | Stripe | Redis | Trigger | Unkey'
  )
  console.log(
    '  --------------|-------------|--------|-------|---------|------'
  )
  for (const [cat, resources] of Object.entries(
    resourcesByCategory
  )) {
    console.log(
      `  ${cat.padEnd(13)} | ${String(resources.transaction).padStart(11)} | ${String(resources.stripe).padStart(6)} | ${String(resources.redis).padStart(5)} | ${String(resources.trigger).padStart(7)} | ${String(resources.unkey).padStart(5)}`
    )
  }

  // Issues
  const filesWithIssues = analyses.filter((a) => a.issues.length > 0)
  if (filesWithIssues.length > 0) {
    console.log('\n=== Files with Issues ===\n')
    for (const analysis of filesWithIssues) {
      console.log(`  ${analysis.file}`)
      for (const issue of analysis.issues) {
        console.log(`    - ${issue}`)
      }
    }
  } else {
    console.log('\n=== No Issues Found ===\n')
  }

  // Legacy tests that need migration
  const legacyTests = analyses.filter((a) => a.category === 'legacy')
  if (legacyTests.length > 0) {
    console.log('\n=== Legacy Tests Requiring Migration ===\n')
    for (const test of legacyTests) {
      const suggestion =
        test.importsTransaction ||
        test.importsStripe ||
        test.importsRedis
          ? '-> *.db.test.ts or *.integration.test.ts'
          : '-> *.unit.test.ts'
      console.log(`  ${test.file} ${suggestion}`)
    }
  }
}

function main() {
  console.log('Analyzing test files for isolation patterns...\n')

  // Find all test files
  const testPattern =
    /\.(test|db\.test|unit\.test|integration\.test|rls\.test)\.tsx?$/
  const allTestFiles = [
    ...findTestFiles(SRC_DIR, testPattern),
    ...findTestFiles(INTEGRATION_TESTS_DIR, testPattern),
    ...findTestFiles(RLS_TESTS_DIR, testPattern),
  ]

  console.log(`Found ${allTestFiles.length} test files`)

  // Analyze each file
  const analyses = allTestFiles.map(analyzeTestFile)

  // Print report
  printReport(analyses)

  // Exit with error if there are legacy tests
  const hasLegacyTests = analyses.some((a) => a.category === 'legacy')
  if (hasLegacyTests) {
    console.log(
      '\n⚠️  Legacy test files should be migrated to new categories.'
    )
    // Don't fail - legacy tests are allowed for now
  }

  // Exit with error if unit tests have transaction imports
  const unitTestsWithTransactions = analyses.filter(
    (a) => a.category === 'unit' && a.importsTransaction
  )
  if (unitTestsWithTransactions.length > 0) {
    console.log(
      '\n❌ Unit tests should not import transaction functions.'
    )
    process.exit(1)
  }

  console.log('\n✅ Test isolation analysis complete!')
}

main()
