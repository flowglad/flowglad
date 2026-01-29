import { describe, expect, it } from 'vitest'
import {
  fetchCustomerBilling,
  getFlowgladRoute,
} from './FlowgladContext'

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

    it('sanitizes trailing slash from baseURL to prevent double-slash in URL', () => {
      const result = getFlowgladRoute('https://example.com/')
      expect(result).toBe('https://example.com/api/flowglad')
    })

    it('sanitizes multiple trailing slashes from baseURL', () => {
      const result = getFlowgladRoute('https://example.com///')
      expect(result).toBe('https://example.com/api/flowglad')
    })

    it('trims leading whitespace from baseURL', () => {
      const result = getFlowgladRoute('  https://example.com')
      expect(result).toBe('https://example.com/api/flowglad')
    })

    it('trims trailing whitespace from baseURL', () => {
      const result = getFlowgladRoute('https://example.com  ')
      expect(result).toBe('https://example.com/api/flowglad')
    })

    it('trims whitespace and sanitizes trailing slashes from baseURL simultaneously', () => {
      const result = getFlowgladRoute('  https://example.com/  ')
      expect(result).toBe('https://example.com/api/flowglad')
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

describe('fetchCustomerBilling', () => {
  it('includes Content-Type application/json header by default', async () => {
    let capturedHeaders: HeadersInit | undefined

    const mockFetch = async (
      _url: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      capturedHeaders = init?.headers
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as typeof fetch,
      },
    })

    expect(capturedHeaders).toEqual({
      'Content-Type': 'application/json',
    })
  })

  it('merges custom headers from requestConfig while preserving Content-Type', async () => {
    let capturedHeaders: HeadersInit | undefined

    const mockFetch = async (
      _url: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      capturedHeaders = init?.headers
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as typeof fetch,
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'custom-value',
        },
      },
    })

    expect(capturedHeaders).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token123',
      'X-Custom-Header': 'custom-value',
    })
  })

  it('allows requestConfig headers to override Content-Type if explicitly provided', async () => {
    let capturedHeaders: HeadersInit | undefined

    const mockFetch = async (
      _url: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      capturedHeaders = init?.headers
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as typeof fetch,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
    })

    expect(capturedHeaders).toEqual({
      'Content-Type': 'application/json; charset=utf-8',
    })
  })

  it('constructs correct URL using betterAuthBasePath when provided', async () => {
    let capturedUrl: string = ''

    const mockFetch = async (
      url: RequestInfo | URL,
      _init?: RequestInit
    ): Promise<Response> => {
      capturedUrl = String(url)
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await fetchCustomerBilling({
      betterAuthBasePath: '/api/auth',
      requestConfig: {
        fetch: mockFetch as typeof fetch,
      },
    })

    expect(capturedUrl).toBe('/api/auth/flowglad/customers/billing')
  })

  it('returns parsed billing data when response contains data field', async () => {
    const mockBillingData = {
      data: {
        customer: { id: 'cust_123' },
        subscriptions: [],
      },
    }

    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify(mockBillingData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as unknown as typeof fetch,
      },
    })

    expect(result).toEqual(mockBillingData)
  })

  it('returns error object when response contains error field', async () => {
    const mockErrorResponse = {
      error: { message: 'Customer not found' },
    }

    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify(mockErrorResponse), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as unknown as typeof fetch,
      },
    })

    expect(result).toEqual(mockErrorResponse)
  })

  it('returns unexpected shape error when response lacks data or error fields', async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ unexpected: 'shape' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as unknown as typeof fetch,
      },
    })

    expect(result).toEqual({
      data: null,
      error: { message: 'Unexpected billing response shape' },
    })
  })

  it('returns JSON parse error when response is not valid JSON', async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response('not valid json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const result = await fetchCustomerBilling({
      baseURL: 'https://example.com',
      requestConfig: {
        fetch: mockFetch as unknown as typeof fetch,
      },
    })

    expect(result).toEqual({
      data: null,
      error: { message: 'Failed to parse billing response JSON' },
    })
  })

  it('throws error when fetch is not available and no custom fetch is provided', async () => {
    const originalFetch = globalThis.fetch
    // @ts-expect-error - intentionally removing fetch to test error handling
    globalThis.fetch = undefined

    try {
      await expect(
        fetchCustomerBilling({
          baseURL: 'https://example.com',
        })
      ).rejects.toThrow(
        'fetch is not available. In React Native environments, provide a fetch implementation via requestConfig.fetch'
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
