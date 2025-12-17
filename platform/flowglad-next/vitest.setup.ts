// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { stripeServer } from './mocks/stripeServer'
import { svixServer } from './mocks/svixServer'
import { triggerServer } from './mocks/triggerServer'
import { unkeyServer } from './mocks/unkeyServer'
import { seedDatabase } from './seedDatabase'

// Polyfill crypto for Node.js environment
// needed for github actions
if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

// Mock window.matchMedia for tests that use responsive hooks (e.g., use-mobile)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock window.innerWidth for responsive hook tests
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 1024,
})

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
  stripeServer.listen()
  triggerServer.listen()
  svixServer.listen()
  unkeyServer.listen()
  await seedDatabase()
})

// Reset handlers after each test (optional, but recommended)
afterEach(() => {
  stripeServer.resetHandlers()
  triggerServer.resetHandlers()
  svixServer.resetHandlers()
  unkeyServer.resetHandlers()
  cleanup()
})

// Stop the mock server after all tests
afterAll(async () => {
  stripeServer.close()
  triggerServer.close()
  svixServer.close()
  unkeyServer.close()
  //   await dropDatabase()
})
