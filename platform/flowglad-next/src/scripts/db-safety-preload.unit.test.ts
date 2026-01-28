import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  getEffectiveNodeEnv,
  isTestScript,
} from './db-safety-preload'

describe('db-safety-preload', () => {
  describe('isTestScript', () => {
    let originalLifecycleEvent: string | undefined

    beforeEach(() => {
      originalLifecycleEvent = process.env.npm_lifecycle_event
      delete (process.env as Record<string, string | undefined>)
        .npm_lifecycle_event
    })

    afterEach(() => {
      const env = process.env as Record<string, string | undefined>
      if (originalLifecycleEvent !== undefined) {
        env.npm_lifecycle_event = originalLifecycleEvent
      } else {
        delete env.npm_lifecycle_event
      }
    })

    it('returns true when script name starts with "test"', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'test'
      expect(isTestScript()).toBe(true)
    })

    it('returns true when script name starts with "test:" (e.g., test:backend)', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'test:backend'
      expect(isTestScript()).toBe(true)
    })

    it('returns true when script name is "test:integration"', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'test:integration'
      expect(isTestScript()).toBe(true)
    })

    it('returns true regardless of case (TEST:backend)', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'TEST:backend'
      expect(isTestScript()).toBe(true)
    })

    it('returns false when script name does not start with "test"', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'dev'
      expect(isTestScript()).toBe(false)
    })

    it('returns false when script name contains "test" but does not start with it', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'run-test'
      expect(isTestScript()).toBe(false)
    })

    it('returns false when npm_lifecycle_event is unset', () => {
      expect(isTestScript()).toBe(false)
    })
  })

  describe('getEffectiveNodeEnv', () => {
    let originalNodeEnv: string | undefined
    let originalLifecycleEvent: string | undefined

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV
      originalLifecycleEvent = process.env.npm_lifecycle_event
      const env = process.env as Record<string, string | undefined>
      delete env.NODE_ENV
      delete env.npm_lifecycle_event
    })

    afterEach(() => {
      const env = process.env as Record<string, string | undefined>
      if (originalNodeEnv !== undefined) {
        env.NODE_ENV = originalNodeEnv
      } else {
        delete env.NODE_ENV
      }
      if (originalLifecycleEvent !== undefined) {
        env.npm_lifecycle_event = originalLifecycleEvent
      } else {
        delete env.npm_lifecycle_event
      }
    })

    it('returns "test" when script name starts with "test" (auto-detection)', () => {
      ;(
        process.env as Record<string, string | undefined>
      ).npm_lifecycle_event = 'test:backend'
      expect(getEffectiveNodeEnv()).toBe('test')
    })

    it('returns "test" from script detection even when NODE_ENV is different', () => {
      const env = process.env as Record<string, string | undefined>
      env.npm_lifecycle_event = 'test:integration'
      env.NODE_ENV = 'development'
      expect(getEffectiveNodeEnv()).toBe('test')
    })

    it('returns "development" when NODE_ENV is unset and not a test script', () => {
      expect(getEffectiveNodeEnv()).toBe('development')
    })

    it('returns "development" when NODE_ENV is empty string', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        ''
      expect(getEffectiveNodeEnv()).toBe('development')
    })

    it('returns "development" when NODE_ENV is an unrecognized value', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        'staging'
      expect(getEffectiveNodeEnv()).toBe('development')
    })

    it('returns "production" when NODE_ENV is "production"', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        'production'
      expect(getEffectiveNodeEnv()).toBe('production')
    })

    it('returns "production" when NODE_ENV is "PRODUCTION" (case-insensitive)', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        'PRODUCTION'
      expect(getEffectiveNodeEnv()).toBe('production')
    })

    it('returns "test" when NODE_ENV is "test" (explicit)', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        'test'
      expect(getEffectiveNodeEnv()).toBe('test')
    })

    it('returns "test" when NODE_ENV is "TEST" (case-insensitive)', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        'TEST'
      expect(getEffectiveNodeEnv()).toBe('test')
    })

    it('returns "development" when NODE_ENV is "development"', () => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV =
        'development'
      expect(getEffectiveNodeEnv()).toBe('development')
    })
  })
})
