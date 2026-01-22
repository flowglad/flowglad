import { describe, expect, it } from 'bun:test'
import {
  isLocalDatabaseUrl,
  LOCAL_HOST_PATTERNS,
} from './safelyRunScript'

describe('isLocalDatabaseUrl', () => {
  it('returns true for localhost URLs', () => {
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@localhost:5432/db')
    ).toBe(true)
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@localhost/db')
    ).toBe(true)
    expect(
      isLocalDatabaseUrl(
        'postgres://test:test@localhost:5432/test_db'
      )
    ).toBe(true)
  })

  it('returns true for 127.0.0.1 URLs', () => {
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/db')
    ).toBe(true)
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@127.0.0.1:5433/mydb')
    ).toBe(true)
  })

  it('returns true for 0.0.0.0 URLs', () => {
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@0.0.0.0:5432/db')
    ).toBe(true)
  })

  it('returns true for IPv6 localhost (::1) URLs', () => {
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@[::1]:5432/db')
    ).toBe(true)
  })

  it('returns true for Docker host URLs', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@host.docker.internal:5432/db'
      )
    ).toBe(true)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@docker.for.mac.localhost:5432/db'
      )
    ).toBe(true)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@docker.for.mac.host.internal:5432/db'
      )
    ).toBe(true)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@host.containers.internal:5432/db'
      )
    ).toBe(true)
  })

  it('returns false for external production URLs', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@prod.example.com:5432/db'
      )
    ).toBe(false)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@db.supabase.co:5432/postgres'
      )
    ).toBe(false)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@my-database.us-east-1.rds.amazonaws.com:5432/db'
      )
    ).toBe(false)
  })

  it('returns false for staging URLs', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@staging.example.com:5432/db'
      )
    ).toBe(false)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@db-staging.internal:5432/db'
      )
    ).toBe(false)
  })

  it('returns false for invalid URLs (safe default)', () => {
    expect(isLocalDatabaseUrl('not-a-valid-url')).toBe(false)
    expect(isLocalDatabaseUrl('')).toBe(false)
    expect(isLocalDatabaseUrl('localhost')).toBe(false)
  })

  it('handles URLs without credentials', () => {
    expect(isLocalDatabaseUrl('postgresql://localhost:5432/db')).toBe(
      true
    )
    expect(
      isLocalDatabaseUrl('postgresql://prod.example.com:5432/db')
    ).toBe(false)
  })

  it('is case-insensitive for hostnames', () => {
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@LOCALHOST:5432/db')
    ).toBe(true)
    expect(
      isLocalDatabaseUrl('postgresql://user:pass@LocalHost:5432/db')
    ).toBe(true)
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pass@HOST.DOCKER.INTERNAL:5432/db'
      )
    ).toBe(true)
  })
})

describe('LOCAL_HOST_PATTERNS', () => {
  it('contains expected local host patterns', () => {
    expect(LOCAL_HOST_PATTERNS).toContain('localhost')
    expect(LOCAL_HOST_PATTERNS).toContain('127.0.0.1')
    expect(LOCAL_HOST_PATTERNS).toContain('0.0.0.0')
    expect(LOCAL_HOST_PATTERNS).toContain('::1')
    expect(LOCAL_HOST_PATTERNS).toContain('host.docker.internal')
  })

  it('does not contain production patterns', () => {
    expect(LOCAL_HOST_PATTERNS).not.toContain('supabase.co')
    expect(LOCAL_HOST_PATTERNS).not.toContain('amazonaws.com')
    expect(LOCAL_HOST_PATTERNS).not.toContain('example.com')
  })
})
