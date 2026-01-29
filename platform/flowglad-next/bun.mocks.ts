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

// Set environment variable defaults FIRST, before any imports that might use them
// These are fallbacks for when the env vars aren't set in .env files
process.env.UNKEY_API_ID = process.env.UNKEY_API_ID || 'api_test_mock'
process.env.UNKEY_ROOT_KEY =
  process.env.UNKEY_ROOT_KEY || 'unkey_test_mock'
process.env.BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || 'http://localhost:3000'

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
