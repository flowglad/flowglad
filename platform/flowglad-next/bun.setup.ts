/// <reference types="@testing-library/jest-dom" />

// Environment variables are loaded from .env.test via the db-safety-preload script
// which auto-detects test scripts and loads the appropriate env file.

// IMPORTANT: Import mocks first, before any other imports.
// Mock module registration order is critical in bun:test - mock.module() calls
// must precede any imports that transitively load the mocked modules.
// See bun.mocks.ts for details.
import './bun.mocks'

// Import consolidated global type declarations (after mocks)
import '@/test/globals.d'

// Initialize auth session mock to null (will be reset after each test)
globalThis.__mockedAuthSession = null

import { afterAll, afterEach, beforeAll } from 'bun:test'
import { webcrypto } from 'node:crypto'

// Now import the remaining modules (after mocks are set up)
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { cleanup } from '@testing-library/react'
import {
  initializeGlobalMockState,
  resetAllGlobalMocks,
} from '@/test/isolation/globalStateGuard'
import { globalSpyManager } from '@/test/isolation/spyManager'
import { server } from './mocks/server'
import { seedDatabase } from './seedDatabase'

GlobalRegistrator.register()

import { expect } from 'bun:test'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

beforeAll(async () => {
  if (!global.crypto) {
    global.crypto = webcrypto as unknown as Crypto
  }
  server.listen({ onUnhandledRequest: 'warn' })
  await seedDatabase()

  // Initialize global mock state tracking AFTER mocks are set up
  // This captures which __mock* globals exist from mock.module() calls
  initializeGlobalMockState()
})

afterEach(() => {
  server.resetHandlers()
  cleanup()
  // Restore any spies tracked during the test
  globalSpyManager.restoreAll()
  // Reset global test state (auth session, __mock* globals)
  // This clears mocks set up by mock.module() (not delete) and deletes test-added globals
  resetAllGlobalMocks()
})

afterAll(async () => {
  server.close()
})
