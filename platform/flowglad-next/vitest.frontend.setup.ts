/// <reference types="@testing-library/jest-dom" />

import { webcrypto } from 'node:crypto'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest'
import { server } from './mocks/server'
import { seedDatabase } from './seedDatabase'

expect.extend(matchers)

vi.mock('server-only', () => ({}))

vi.mock('@trigger.dev/core', () => ({
  idempotencyKeys: {
    create: async (key: string) => `mock-${key}-${Math.random()}`,
  },
}))

process.env.UNKEY_API_ID = process.env.UNKEY_API_ID || 'api_test_mock'
process.env.UNKEY_ROOT_KEY =
  process.env.UNKEY_ROOT_KEY || 'unkey_test_mock'

if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

beforeAll(async () => {
  if (!global.crypto) {
    global.crypto = webcrypto as unknown as Crypto
  }
  server.listen({ onUnhandledRequest: 'warn' })
  await seedDatabase()
})

afterEach(() => {
  server.resetHandlers()
  cleanup()
})

afterAll(async () => {
  server.close()
})
