import type { Event } from '@/db/schema/events'
import type { CacheDependencyKey } from '@/utils/cache'

/**
 * No-op callbacks for use in tests that don't need to verify cache invalidation or event emission.
 * These are useful when testing functions that require the callbacks but the test
 * doesn't need to assert on the callback behavior.
 */
export const noopInvalidateCache = (
  ..._keys: CacheDependencyKey[]
): void => {}

export const noopEmitEvent = (..._events: Event.Insert[]): void => {}
