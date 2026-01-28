/**
 * Internal cache utilities - NOT part of the public API.
 *
 * These functions should only be imported by:
 * - `transactionEffectsHelpers.ts` (for post-commit cache invalidation)
 * - Test files (for testing cache behavior directly)
 *
 * **DO NOT import from this file in application code.**
 * Use `TransactionEffectsContext.invalidateCache()` instead to ensure
 * cache invalidations happen after transaction commit.
 *
 * @internal
 */

export {
  invalidateDependencies,
  recomputeCacheEntry,
  recomputeDependencies,
} from './cache'
