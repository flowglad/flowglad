/**
 * RLS (Row Level Security) test setup for bun:test
 *
 * RLS tests verify database row-level security policies. They:
 * - DO need real database access (to test RLS policies)
 * - DO NOT need real Redis (uses stub client)
 * - DO NOT need real Stripe (not testing payment flows)
 *
 * This is separate from bun.integration.setup.ts which enables real Redis.
 */

// Import mocks first (required for bun:test)
import './bun.mocks'

import { beforeAll } from 'bun:test'
import { seedDatabase } from './seedDatabase'

// RLS tests use the stub Redis client (default behavior in test mode)
// They don't need real Redis - they only test database RLS policies

beforeAll(async () => {
  await seedDatabase()
})
