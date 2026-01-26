/**
 * Test Isolation Utilities
 *
 * This module provides utilities for automatic test isolation in parallel test execution.
 * These utilities are used by the test setup files (bun.unit.setup.ts, bun.db.test.setup.ts)
 * to ensure tests don't share state.
 *
 * Most tests don't need to import these directly - isolation is automatic.
 *
 * Key utilities:
 * - createAutoEnvTracker: Captures and restores process.env state
 * - initializeGlobalMockState: Tracks which __mock* globals were set by mock.module()
 * - resetAllGlobalMocks: Clears mock.module() mocks and deletes test-added globals
 * - trackSpy: Tracks spies for automatic cleanup (used by setup files)
 */

export { createAutoEnvTracker } from './envTracker'
export {
  initializeGlobalMockState,
  resetAllGlobalMocks,
} from './globalStateGuard'
export {
  createAutoSpyManager,
  globalSpyManager,
  trackSpy,
} from './spyManager'
