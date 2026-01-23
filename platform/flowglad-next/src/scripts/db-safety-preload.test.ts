import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  getEffectiveNodeEnv,
  isLocalDatabaseUrl,
  LOCAL_HOST_PATTERNS,
  maskDatabaseUrl,
  shouldSkipSafetyCheck,
} from './db-safety-preload'

describe('db-safety-preload', () => {
  describe('getEffectiveNodeEnv', () => {
    let originalNodeEnv: string | undefined

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV
      delete (process.env as Record<string, string | undefined>)
        .NODE_ENV
    })

    afterEach(() => {
      const env = process.env as Record<string, string | undefined>
      if (originalNodeEnv !== undefined) {
        env.NODE_ENV = originalNodeEnv
      } else {
        delete env.NODE_ENV
      }
    })

    it('returns "development" when NODE_ENV is unset (development is the default)', () => {
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

    it('returns "test" when NODE_ENV is "test"', () => {
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

  describe('shouldSkipSafetyCheck', () => {
    // Store original env to restore after each test
    let originalEnv: Record<string, string | undefined>

    beforeEach(() => {
      originalEnv = { ...process.env }
      // Clear all safety-related env vars using delete for proper removal
      // Type assertion needed because TypeScript declares process.env as readonly
      const env = process.env as Record<string, string | undefined>
      delete env.NODE_ENV
      delete env.VERCEL
      delete env.CI
      delete env.DANGEROUSLY_ALLOW_REMOTE_DB
    })

    afterEach(() => {
      // Restore original env
      // Type assertion needed because TypeScript declares process.env as readonly
      const env = process.env as Record<string, string | undefined>
      Object.keys(env).forEach((key) => {
        delete env[key]
      })
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          env[key] = value
        }
      })
    })

    it('returns false when no safety-bypass environment variables are set', () => {
      expect(shouldSkipSafetyCheck()).toBe(false)
    })

    it('returns false when NODE_ENV is production (intentionally not a bypass to prevent AI agent misuse)', () => {
      const env = process.env as Record<string, string | undefined>
      env.NODE_ENV = 'production'
      expect(shouldSkipSafetyCheck()).toBe(false)
    })

    it('returns false when NODE_ENV is development', () => {
      const env = process.env as Record<string, string | undefined>
      env.NODE_ENV = 'development'
      expect(shouldSkipSafetyCheck()).toBe(false)
    })

    it('returns true when VERCEL is set (any value)', () => {
      const env = process.env as Record<string, string | undefined>
      env.VERCEL = '1'
      expect(shouldSkipSafetyCheck()).toBe(true)
    })

    it('returns true when VERCEL is set to empty string', () => {
      const env = process.env as Record<string, string | undefined>
      env.VERCEL = ''
      expect(shouldSkipSafetyCheck()).toBe(true)
    })

    it('returns true when CI is set', () => {
      const env = process.env as Record<string, string | undefined>
      env.CI = 'true'
      expect(shouldSkipSafetyCheck()).toBe(true)
    })

    it('returns true when DANGEROUSLY_ALLOW_REMOTE_DB is set', () => {
      const env = process.env as Record<string, string | undefined>
      env.DANGEROUSLY_ALLOW_REMOTE_DB = '1'
      expect(shouldSkipSafetyCheck()).toBe(true)
    })
  })

  describe('isLocalDatabaseUrl', () => {
    it('returns true for localhost URLs', () => {
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@localhost:5432/db')
      ).toBe(true)
      expect(
        isLocalDatabaseUrl('postgres://test@localhost/mydb')
      ).toBe(true)
    })

    it('returns true for 127.0.0.1 URLs', () => {
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/db')
      ).toBe(true)
    })

    it('returns true for 0.0.0.0 URLs', () => {
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@0.0.0.0:5432/db')
      ).toBe(true)
    })

    it('returns true for IPv6 loopback (::1) URLs', () => {
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@[::1]:5432/db')
      ).toBe(true)
    })

    it('returns true for .local domain URLs', () => {
      expect(
        isLocalDatabaseUrl(
          'postgresql://user:pass@myhost.local:5432/db'
        )
      ).toBe(true)
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@db.local:5432/db')
      ).toBe(true)
    })

    it('returns true for host.docker.internal URLs', () => {
      expect(
        isLocalDatabaseUrl(
          'postgresql://user:pass@host.docker.internal:5432/db'
        )
      ).toBe(true)
    })

    it('returns false for Supabase production URLs', () => {
      expect(
        isLocalDatabaseUrl(
          'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres'
        )
      ).toBe(false)
    })

    it('returns false for Supabase pooler URLs', () => {
      expect(
        isLocalDatabaseUrl(
          'postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
        )
      ).toBe(false)
    })

    it('returns false for AWS RDS URLs', () => {
      expect(
        isLocalDatabaseUrl(
          'postgresql://user:pass@mydb.cluster-xyz.us-east-1.rds.amazonaws.com:5432/mydb'
        )
      ).toBe(false)
    })

    it('returns false for generic cloud database URLs', () => {
      expect(
        isLocalDatabaseUrl(
          'postgresql://user:pass@prod-db.example.com:5432/mydb'
        )
      ).toBe(false)
    })

    it('returns false for invalid URLs', () => {
      expect(isLocalDatabaseUrl('not-a-url')).toBe(false)
      expect(isLocalDatabaseUrl('')).toBe(false)
      expect(isLocalDatabaseUrl('just-some-text')).toBe(false)
    })

    it('handles URLs case-insensitively', () => {
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@LOCALHOST:5432/db')
      ).toBe(true)
      expect(
        isLocalDatabaseUrl('postgresql://user:pass@LocalHost:5432/db')
      ).toBe(true)
    })
  })

  describe('maskDatabaseUrl', () => {
    it('masks the password in a standard database URL', () => {
      const url =
        'postgresql://myuser:supersecret@localhost:5432/mydb'
      const masked = maskDatabaseUrl(url)
      expect(masked).toBe(
        'postgresql://myuser:****@localhost:5432/mydb'
      )
      expect(masked).not.toContain('supersecret')
    })

    it('masks the password in a production Supabase URL', () => {
      const url =
        'postgresql://postgres.abc:my-secret-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
      const masked = maskDatabaseUrl(url)
      expect(masked).toBe(
        'postgresql://postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
      )
      expect(masked).not.toContain('my-secret-password')
    })

    it('handles URLs without passwords', () => {
      const url = 'postgresql://postgres@localhost:5432/mydb'
      const masked = maskDatabaseUrl(url)
      expect(masked).toBe(url)
    })

    it('returns "(invalid URL)" for invalid URLs', () => {
      expect(maskDatabaseUrl('not-a-url')).toBe('(invalid URL)')
      expect(maskDatabaseUrl('')).toBe('(invalid URL)')
    })

    it('masks passwords containing special characters', () => {
      const url =
        'postgresql://user:pass@word!with#special$chars@localhost:5432/db'
      const masked = maskDatabaseUrl(url)
      expect(masked).not.toContain('pass@word')
      expect(masked).toContain('****')
    })

    it('masks percent-encoded passwords correctly', () => {
      // Password with @ encoded as %40
      const url = 'postgresql://user:pass%40word@localhost:5432/db'
      const masked = maskDatabaseUrl(url)
      expect(masked).toBe('postgresql://user:****@localhost:5432/db')
      expect(masked).not.toContain('%40')
      expect(masked).not.toContain('pass')
    })
  })

  describe('LOCAL_HOST_PATTERNS', () => {
    it('contains expected local host patterns', () => {
      expect(LOCAL_HOST_PATTERNS).toContain('localhost')
      expect(LOCAL_HOST_PATTERNS).toContain('127.0.0.1')
      expect(LOCAL_HOST_PATTERNS).toContain('0.0.0.0')
      expect(LOCAL_HOST_PATTERNS).toContain('::1')
      expect(LOCAL_HOST_PATTERNS).toContain('.local')
      expect(LOCAL_HOST_PATTERNS).toContain('host.docker.internal')
    })

    it('is a readonly tuple', () => {
      expect(Array.isArray(LOCAL_HOST_PATTERNS)).toBe(true)
      expect(LOCAL_HOST_PATTERNS.length).toBeGreaterThan(0)
    })
  })
})
