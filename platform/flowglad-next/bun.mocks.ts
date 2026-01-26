/**
 * This file MUST be imported before any other modules in test setup files.
 *
 * Mock module registration order is critical in bun:test - mock.module() calls
 * must precede any imports that transitively load the mocked modules. By isolating
 * all mock.module() calls in this file and importing it first, we ensure the mocks
 * are registered before module resolution caches the real implementations.
 *
 * This file is used by ALL test types (unit, db, integration).
 * For db-specific blockers and mocks, see bun.db.mocks.ts.
 */
import { mock } from 'bun:test'

// Import common module mocks (trigger tasks, auth, server-only)
import './mocks/module-mocks'

// Import and register the Unkey SDK mock (working mock for unit tests)
import { MockUnkey } from './mocks/unkey-sdk-mock'

mock.module('@unkey/api', () => ({
  Unkey: MockUnkey,
  default: MockUnkey,
}))

// Import and register Redis utility mock
import { redisMockExports } from './mocks/redis-mock'

mock.module('@/utils/redis', () => redisMockExports)

// Import and register Svix utility mock
import { svixMockExports } from './mocks/svix-mock'

mock.module('@/utils/svix', () => svixMockExports)
