/**
 * Test Isolation Utilities
 *
 * This module provides utilities for automatic test isolation in parallel test execution.
 * These utilities are used by the test setup files (bun.unit.setup.ts, bun.dbtest.setup.ts)
 * to ensure tests don't share state.
 *
 * Most tests don't need to import these directly - isolation is automatic.
 * However, tests can use trackSpy() for convenient spy tracking.
 *
 * @example
 * ```typescript
 * // For tracking spies in test files:
 * import { trackSpy } from '@/test/isolation'
 *
 * beforeEach(() => {
 *   trackSpy(spyOn(myModule, 'fn').mockReturnValue('mocked'))
 * })
 * ```
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
