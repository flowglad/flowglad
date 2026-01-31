/**
 * Unit Test Mocks
 *
 * This file contains mock.module() calls for modules that need mocking
 * ONLY in unit tests.
 *
 * NOTE: External services (Svix, Unkey, Trigger, Redis, Resend) are NOT
 * mocked here. Unit tests use the same mock server containers as DB tests.
 * The only difference is that unit tests BLOCK database access.
 *
 * IMPORTANT: Import this file ONLY in bun.unit.setup.ts, AFTER bun.mocks.ts.
 */
import { mock } from 'bun:test'

// Block database access in unit tests - forces tests to use *.db.test.ts
// for any code that needs database
mock.module('@/db/client', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

mock.module('@/db/adminTransaction', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

mock.module('@/db/authenticatedTransaction', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

mock.module('@/db/recomputeTransaction', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})
