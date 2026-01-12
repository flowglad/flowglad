import { describe, expect, it } from 'vitest'
import { getFlowgladRoute } from './FlowgladContext'

describe('getFlowgladRoute', () => {
  describe('default behavior (no betterAuthBasePath)', () => {
    it('returns "/api/flowglad" when neither baseURL nor betterAuthBasePath are provided', () => {
      const result = getFlowgladRoute()
      expect(result).toBe('/api/flowglad')
    })

    it('returns "/api/flowglad" when baseURL is undefined and betterAuthBasePath is undefined', () => {
      const result = getFlowgladRoute(undefined, undefined)
      expect(result).toBe('/api/flowglad')
    })

    it('returns "{baseURL}/api/flowglad" when only baseURL is provided', () => {
      const result = getFlowgladRoute('https://example.com')
      expect(result).toBe('https://example.com/api/flowglad')
    })

    it('returns "{baseURL}/api/flowglad" when baseURL is provided and betterAuthBasePath is undefined', () => {
      const result = getFlowgladRoute('https://myapp.com', undefined)
      expect(result).toBe('https://myapp.com/api/flowglad')
    })
  })

  describe('Better Auth mode (betterAuthBasePath provided)', () => {
    it('returns "{betterAuthBasePath}/flowglad" when betterAuthBasePath is provided', () => {
      const result = getFlowgladRoute(undefined, '/api/auth')
      expect(result).toBe('/api/auth/flowglad')
    })

    it('prioritizes betterAuthBasePath over baseURL when both are provided', () => {
      const result = getFlowgladRoute(
        'https://example.com',
        '/api/auth'
      )
      expect(result).toBe('/api/auth/flowglad')
    })

    it('sanitizes trailing slashes from betterAuthBasePath to prevent malformed URLs', () => {
      const result = getFlowgladRoute(undefined, '/api/auth/')
      expect(result).toBe('/api/auth/flowglad')
    })

    it('sanitizes multiple trailing slashes from betterAuthBasePath', () => {
      const result = getFlowgladRoute(undefined, '/api/auth///')
      expect(result).toBe('/api/auth/flowglad')
    })

    it('handles betterAuthBasePath with full URL', () => {
      const result = getFlowgladRoute(
        undefined,
        'https://myapp.com/api/auth'
      )
      expect(result).toBe('https://myapp.com/api/auth/flowglad')
    })

    it('handles betterAuthBasePath with full URL and trailing slash', () => {
      const result = getFlowgladRoute(
        undefined,
        'https://myapp.com/api/auth/'
      )
      expect(result).toBe('https://myapp.com/api/auth/flowglad')
    })
  })
})
