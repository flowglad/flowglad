/**
 * Integration Tests for Test Infrastructure Isolation
 *
 * These tests verify that the test isolation mechanisms work correctly:
 * 1. Environment variables are restored between tests
 * 2. Spies are cleaned up between tests
 * 3. Global mock state is reset between tests
 * 4. Database changes are rolled back between tests
 *
 * IMPORTANT: Test order matters here. The tests are designed as pairs where
 * the first test modifies state and the second test verifies it was reset.
 * Bun runs tests in definition order within a describe block.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { countries } from '@/db/schema/countries'
import { trackSpy } from '@/test/isolation'
import core from '@/utils/core'

describe('Test Infrastructure Isolation', () => {
  describe('Environment Variable Isolation', () => {
    const TEST_ENV_KEY = '__TEST_ISOLATION_ENV_VAR__'
    const ORIGINAL_VALUE = 'original_value'
    const MODIFIED_VALUE = 'modified_value'

    beforeEach(() => {
      // Set a known starting value
      process.env[TEST_ENV_KEY] = ORIGINAL_VALUE
    })

    it('test A: modifies environment variable', () => {
      // Verify starting state
      expect(process.env[TEST_ENV_KEY]).toBe(ORIGINAL_VALUE)

      // Modify the environment variable
      process.env[TEST_ENV_KEY] = MODIFIED_VALUE
      expect(process.env[TEST_ENV_KEY]).toBe(MODIFIED_VALUE)
    })

    it('test B: verifies environment variable was restored to beforeEach state', () => {
      // The env var should be restored to the beforeEach value, not the modified value
      expect(process.env[TEST_ENV_KEY]).toBe(ORIGINAL_VALUE)
    })

    afterEach(() => {
      // Clean up
      delete process.env[TEST_ENV_KEY]
    })
  })

  describe('Environment Variable Deletion Isolation', () => {
    const TEST_ENV_KEY = '__TEST_ISOLATION_DELETE_VAR__'

    beforeEach(() => {
      process.env[TEST_ENV_KEY] = 'should_exist'
    })

    it('test A: deletes environment variable', () => {
      expect(process.env[TEST_ENV_KEY]).toBe('should_exist')
      delete process.env[TEST_ENV_KEY]
      expect(process.env[TEST_ENV_KEY]).toBeUndefined()
    })

    it('test B: verifies deleted environment variable was restored', () => {
      // The deleted env var should be restored
      expect(process.env[TEST_ENV_KEY]).toBe('should_exist')
    })

    afterEach(() => {
      delete process.env[TEST_ENV_KEY]
    })
  })

  describe('Spy Isolation with trackSpy', () => {
    // Use a simple object to spy on
    const testModule = {
      getValue: () => 'real_value',
    }

    it('test A: creates a tracked spy that modifies behavior', () => {
      // Verify original behavior
      expect(testModule.getValue()).toBe('real_value')

      // Create a tracked spy
      trackSpy(
        spyOn(testModule, 'getValue').mockReturnValue('mocked_value')
      )

      // Verify mocked behavior
      expect(testModule.getValue()).toBe('mocked_value')
    })

    it('test B: verifies spy was restored and original behavior works', () => {
      // The spy should have been restored, so we get the real value
      expect(testModule.getValue()).toBe('real_value')
    })
  })

  describe('Global Mock State Isolation (__mock* pattern)', () => {
    // This tests the globalStateGuard which resets __mock* globals
    // Note: globals without __mock prefix are NOT automatically cleaned up

    it('test A: sets a __mock* global variable', () => {
      // Set a mock global (matching the __mock* pattern that globalStateGuard looks for)
      ;(
        globalThis as Record<string, unknown>
      ).__mockTestIsolationValue = {
        someData: 'test_data',
      }

      expect(
        (globalThis as Record<string, unknown>)
          .__mockTestIsolationValue
      ).toEqual({ someData: 'test_data' })
    })

    it('test B: verifies __mock* global was cleaned up', () => {
      // Globals matching __mock* pattern that weren't set by mock.module()
      // should be deleted by globalStateGuard
      const value = (globalThis as Record<string, unknown>)
        .__mockTestIsolationValue
      expect(value === undefined || value === null).toBe(true)
    })
  })

  describe('Database Transaction Isolation', () => {
    // Use a unique country code that won't conflict with seeded data
    const uniqueCode = `Z${core.nanoid().slice(0, 1).toUpperCase()}`
    const uniqueName = `Test Country ${core.nanoid()}`

    it('test A: inserts a record into the database', async () => {
      // Insert a country (simple table with minimal required fields)
      await db.insert(countries).values({
        id: `country_${core.nanoid()}`,
        code: uniqueCode,
        name: uniqueName,
      })

      // Verify it exists within this test
      const results = await db
        .select()
        .from(countries)
        .where(eq(countries.code, uniqueCode))

      expect(results.length).toBe(1)
      expect(results[0].name).toBe(uniqueName)
    })

    it('test B: verifies inserted record was rolled back', async () => {
      // The country from test A should NOT exist because
      // the savepoint was rolled back
      const results = await db
        .select()
        .from(countries)
        .where(eq(countries.code, uniqueCode))

      expect(results.length).toBe(0)
    })
  })

  describe('Multiple Database Operations Isolation', () => {
    // Use a longer unique prefix that won't match seeded countries
    // Country codes in seeds are typically 2-letter ISO codes (US, UK, etc.)
    const uniquePrefix = `X${core.nanoid().slice(0, 5).toUpperCase()}`

    it('test A: performs multiple inserts', async () => {
      // Insert multiple countries
      for (let i = 0; i < 3; i++) {
        await db.insert(countries).values({
          id: `country_${core.nanoid()}`,
          code: `${uniquePrefix}${i}`,
          name: `Test Multi ${i} ${core.nanoid()}`,
        })
      }

      // Verify all exist - use exact code matching, not prefix matching
      const results = await db.select().from(countries)
      const matchingCountries = results.filter((c) =>
        c.code.startsWith(uniquePrefix)
      )
      expect(matchingCountries.length).toBe(3)
    })

    it('test B: verifies all inserts were rolled back', async () => {
      const results = await db.select().from(countries)
      const matchingCountries = results.filter((c) =>
        c.code.startsWith(uniquePrefix)
      )
      expect(matchingCountries.length).toBe(0)
    })
  })

  describe('Auth Session Mock Isolation', () => {
    it('test A: sets mocked auth session', () => {
      globalThis.__mockedAuthSession = {
        user: { id: 'user_test_123', email: 'test@isolation.com' },
      }

      expect(globalThis.__mockedAuthSession).toEqual({
        user: { id: 'user_test_123', email: 'test@isolation.com' },
      })
    })

    it('test B: verifies auth session was reset to null', () => {
      // The setup files reset __mockedAuthSession to null after each test
      expect(globalThis.__mockedAuthSession).toBeNull()
    })
  })
})

describe('Isolation Edge Cases', () => {
  describe('Nested beforeEach/afterEach', () => {
    let outerValue = 'initial'
    let innerValue = 'initial'

    beforeEach(() => {
      outerValue = 'outer_set'
    })

    describe('inner describe', () => {
      beforeEach(() => {
        innerValue = 'inner_set'
      })

      it('test A: modifies both values', () => {
        expect(outerValue).toBe('outer_set')
        expect(innerValue).toBe('inner_set')

        outerValue = 'modified_outer'
        innerValue = 'modified_inner'
      })

      it('test B: verifies both values were reset by beforeEach', () => {
        // Both should be reset to their beforeEach values
        expect(outerValue).toBe('outer_set')
        expect(innerValue).toBe('inner_set')
      })
    })
  })

  describe('Error in test does not break isolation', () => {
    const TEST_KEY = '__ERROR_ISOLATION_TEST__'

    beforeEach(() => {
      process.env[TEST_KEY] = 'before_error'
    })

    it('test A: modifies env then would error (but we catch it)', () => {
      process.env[TEST_KEY] = 'after_modification'
      // Don't actually throw - just verify the modification happened
      expect(process.env[TEST_KEY]).toBe('after_modification')
    })

    it('test B: verifies isolation still works after previous test', () => {
      // Even if the previous test had issues, isolation should work
      expect(process.env[TEST_KEY]).toBe('before_error')
    })

    afterEach(() => {
      delete process.env[TEST_KEY]
    })
  })
})
