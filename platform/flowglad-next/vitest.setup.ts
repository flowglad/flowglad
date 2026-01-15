// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './mocks/server'
import { seedDatabase } from './seedDatabase'

// Ensure Unkey env vars are set for tests (MSW mocks the actual API calls)
process.env.UNKEY_API_ID = process.env.UNKEY_API_ID || 'api_test_mock'
process.env.UNKEY_ROOT_KEY =
  process.env.UNKEY_ROOT_KEY || 'unkey_test_mock'

// Polyfill crypto for Node.js environment
// needed for github actions
if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

// Ensure crypto is available before mocking idempotencyKeys
beforeAll(() => {
  if (!global.crypto) {
    global.crypto = webcrypto as unknown as Crypto
  }
})

// Mock idempotencyKeys.create to return a predictable value
vi.mock('@trigger.dev/core', async () => {
  return {
    idempotencyKeys: {
      create: vi
        .fn()
        .mockImplementation(
          async (key: string) => `mock-${key}-${Math.random()}`
        ),
    },
  }
})

// Start the mock server before all tests
beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'warn' })
  await seedDatabase()
})

// Reset handlers after each test (optional, but recommended)
afterEach(() => {
  server.resetHandlers()
  cleanup()
})

// Stop the mock server after all tests
afterAll(async () => {
  server.close()
  //   await dropDatabase()
})
