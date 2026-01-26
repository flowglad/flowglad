/**
 * Test File Detection
 *
 * Provides stack trace-based detection of the current test file.
 * This is used to associate database operations with the correct
 * per-file transaction context in parallel test execution.
 *
 * The detection works by parsing the call stack to find the first
 * frame that references a .db.test.ts file.
 */

// Import the globals type for FileTestContext reference
import type {} from '@/test/globals'

/**
 * Fallback key used when test file cannot be detected from stack trace.
 * This happens when beforeAll/beforeEach are defined in a setup file
 * rather than in the test file itself.
 *
 * When using this fallback, all tests share the same database context,
 * which means parallel file execution won't work correctly. However,
 * per-test isolation via savepoints still works.
 */
export const UNKNOWN_TEST_FILE = '__shared_test_context__'

/**
 * Get the current test file path from the stack trace.
 *
 * This identifies which file's DB context to use for parallel test execution.
 * It parses the call stack to find the first frame that references a .db.test.ts file.
 *
 * When called from a shared setup file (like bun.db.test.setup.ts), the stack
 * trace may not include the actual test file. In this case, a fallback key
 * is returned, which means all tests share the same context. Per-test isolation
 * via savepoints still works, but parallel file execution won't.
 *
 * @returns The file path of the calling .db.test.ts file, or UNKNOWN_TEST_FILE
 *
 * Stack trace formats handled:
 * - Node.js: "    at functionName (/path/to/file.db.test.ts:123:45)"
 * - Node.js (anonymous): "    at /path/to/file.db.test.ts:123:45"
 * - Bun: May have slight variations in format
 */
export function getCurrentTestFile(): string {
  const stack = new Error().stack || ''
  const lines = stack.split('\n')

  // Find the first line that contains a .db.test.ts file
  for (const line of lines) {
    // Format: "    at functionName (/path/to/file.db.test.ts:123:45)"
    const matchWithParens = line.match(/\(([^)]+\.db\.test\.ts)/)
    if (matchWithParens) {
      return matchWithParens[1]
    }

    // Format: "    at /path/to/file.db.test.ts:123:45" (no function name)
    const matchWithoutParens = line.match(
      /at\s+([^\s]+\.db\.test\.ts)/
    )
    if (matchWithoutParens) {
      return matchWithoutParens[1]
    }
  }

  // No .db.test.ts file found in stack - use fallback
  // This typically happens when beforeAll/beforeEach are defined in a setup file
  return UNKNOWN_TEST_FILE
}

/**
 * Get the current test file path, or null if not in a test context.
 *
 * This is a non-throwing variant for use in the db client proxy,
 * where we need to gracefully fall back to the production connection
 * when not in a test context.
 *
 * @returns The file path of the calling .db.test.ts file, or null if not found
 */
export function getCurrentTestFileOrNull(): string | null {
  const stack = new Error().stack || ''
  const lines = stack.split('\n')

  // Find the first line that contains a .db.test.ts file
  for (const line of lines) {
    const matchWithParens = line.match(/\(([^)]+\.db\.test\.ts)/)
    if (matchWithParens) {
      return matchWithParens[1]
    }

    const matchWithoutParens = line.match(
      /at\s+([^\s]+\.db\.test\.ts)/
    )
    if (matchWithoutParens) {
      return matchWithoutParens[1]
    }
  }

  return null
}
