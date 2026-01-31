import { describe, expect, it } from 'bun:test'
import {
  handleCreateKeyV2,
  handleDeleteKeyV2,
  handleUnkeyRoute,
  handleUpdateKeyV2,
  handleVerifyKeyV1,
  handleVerifyKeyV2,
} from './unkey'

/**
 * Assert that a response is not null and return it with proper type narrowing
 */
async function assertResponse(
  response: Promise<Response | null>
): Promise<Response> {
  const result = await response
  expect(result).toBeInstanceOf(Response)
  if (!result) {
    throw new Error('Expected Response but got null')
  }
  return result
}

describe('Unkey V2 Routes', () => {
  describe('handleCreateKeyV2', () => {
    it('returns valid response with correct structure, headers, and prefixed IDs', async () => {
      const response = handleCreateKeyV2()

      // Verify HTTP response properties
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        'application/json'
      )

      // Verify response body structure and ID prefixes
      const body = await response.json()
      expect(body.meta.requestId).toMatch(/^req_/)
      expect(body.data.key).toMatch(/^unkey_mock_key_/)
      expect(body.data.keyId).toMatch(/^key_mock123_/)
    })

    it('generates unique IDs for each call', async () => {
      const response1 = handleCreateKeyV2()
      const response2 = handleCreateKeyV2()
      const body1 = await response1.json()
      const body2 = await response2.json()

      expect(body1.meta.requestId).not.toBe(body2.meta.requestId)
      expect(body1.data.key).not.toBe(body2.data.key)
      expect(body1.data.keyId).not.toBe(body2.data.keyId)
    })
  })

  describe('handleVerifyKeyV2', () => {
    it('returns valid response with correct structure, validation result, and identity info', async () => {
      const response = handleVerifyKeyV2()

      // Verify HTTP response properties
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        'application/json'
      )

      // Verify response body structure
      const body = await response.json()
      expect(body.meta.requestId).toMatch(/^req_/)
      expect(body.data.valid).toBe(true)
      expect(body.data.code).toBe('VALID')
      expect(body.data.keyId).toMatch(/^key_mock123_/)
      expect(body.data.meta).toEqual({})
      expect(body.data.identity.id).toMatch(/^identity_/)
      expect(body.data.identity.externalId).toMatch(/^owner_mock_id_/)
    })
  })

  describe('handleDeleteKeyV2', () => {
    it('returns valid response with empty data object', async () => {
      const response = handleDeleteKeyV2()

      // Verify HTTP response properties
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        'application/json'
      )

      // Verify response body structure
      const body = await response.json()
      expect(body.meta.requestId).toMatch(/^req_/)
      expect(body.data).toEqual({})
    })
  })

  describe('handleUpdateKeyV2', () => {
    it('returns valid response with meta only (no data field)', async () => {
      const response = handleUpdateKeyV2()

      // Verify HTTP response properties
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        'application/json'
      )

      // Verify response body structure
      const body = await response.json()
      expect(body.meta.requestId).toMatch(/^req_/)
      expect(body.data).toBeUndefined()
    })
  })
})

describe('Unkey V1 Routes (Legacy)', () => {
  describe('handleVerifyKeyV1', () => {
    it('returns valid response with legacy verification format', async () => {
      const response = handleVerifyKeyV1()

      // Verify HTTP response properties
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        'application/json'
      )

      // Verify response body structure
      const body = await response.json()
      expect(body.valid).toBe(true)
      expect(body.ownerId).toMatch(/^owner_mock_id_/)
      expect(body.meta).toEqual({})
      expect(body.expires).toBeNull()
      expect(body.remaining).toBeNull()
      expect(body.ratelimit).toBeNull()
    })
  })
})

describe('handleUnkeyRoute', () => {
  function createPostRequest(pathname: string): Request {
    return new Request(`http://localhost:9002${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  }

  function createGetRequest(pathname: string): Request {
    return new Request(`http://localhost:9002${pathname}`, {
      method: 'GET',
    })
  }

  it('routes POST /v2/keys.createKey to handleCreateKeyV2', async () => {
    const req = createPostRequest('/v2/keys.createKey')
    const response = await assertResponse(
      handleUnkeyRoute(req, '/v2/keys.createKey')
    )
    const body = await response.json()
    expect(body.data.key).toMatch(/^unkey_mock_key_/)
    expect(body.data.keyId).toMatch(/^key_mock123_/)
  })

  it('routes POST /v2/keys.verifyKey to handleVerifyKeyV2', async () => {
    const req = createPostRequest('/v2/keys.verifyKey')
    const response = await assertResponse(
      handleUnkeyRoute(req, '/v2/keys.verifyKey')
    )
    const body = await response.json()
    expect(body.data.valid).toBe(true)
    expect(body.data.code).toBe('VALID')
  })

  it('routes POST /v2/keys.deleteKey to handleDeleteKeyV2', async () => {
    const req = createPostRequest('/v2/keys.deleteKey')
    const response = await assertResponse(
      handleUnkeyRoute(req, '/v2/keys.deleteKey')
    )
    const body = await response.json()
    expect(body.data).toEqual({})
  })

  it('routes POST /v2/keys.updateKey to handleUpdateKeyV2', async () => {
    const req = createPostRequest('/v2/keys.updateKey')
    const response = await assertResponse(
      handleUnkeyRoute(req, '/v2/keys.updateKey')
    )
    const body = await response.json()
    expect(body.meta.requestId).toMatch(/^req_/)
  })

  it('routes POST /v1/keys.verifyKey to handleVerifyKeyV1', async () => {
    const req = createPostRequest('/v1/keys.verifyKey')
    const response = await assertResponse(
      handleUnkeyRoute(req, '/v1/keys.verifyKey')
    )
    const body = await response.json()
    expect(body.valid).toBe(true)
    expect(body.ownerId).toMatch(/^owner_mock_id_/)
  })

  it('returns null for GET requests', async () => {
    const req = createGetRequest('/v2/keys.createKey')
    const response = await handleUnkeyRoute(req, '/v2/keys.createKey')
    expect(response).toBeNull()
  })

  it('returns null for unknown routes', async () => {
    const req = createPostRequest('/v2/keys.unknownEndpoint')
    const response = await handleUnkeyRoute(
      req,
      '/v2/keys.unknownEndpoint'
    )
    expect(response).toBeNull()
  })

  it('returns null for root path', async () => {
    const req = createPostRequest('/')
    const response = await handleUnkeyRoute(req, '/')
    expect(response).toBeNull()
  })

  describe('error simulation', () => {
    function createErrorRequest(
      pathname: string,
      errorValue: string,
      customMessage?: string
    ): Request {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Mock-Error': errorValue,
      }
      if (customMessage) {
        headers['X-Mock-Error-Message'] = customMessage
      }
      return new Request(`http://localhost:9002${pathname}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
    }

    it('returns 500 error when X-Mock-Error header is set to true', async () => {
      const req = createErrorRequest('/v2/keys.createKey', 'true')
      const response = await assertResponse(
        handleUnkeyRoute(req, '/v2/keys.createKey')
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR')
      expect(body.error.message).toBe('Internal Server Error')
    })

    it('returns specified status code when X-Mock-Error is a number', async () => {
      const req = createErrorRequest('/v2/keys.verifyKey', '404')
      const response = await assertResponse(
        handleUnkeyRoute(req, '/v2/keys.verifyKey')
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error.code).toBe('NOT_FOUND')
      expect(body.error.message).toBe('Not Found')
    })

    it('returns 401 unauthorized error', async () => {
      const req = createErrorRequest('/v2/keys.createKey', '401')
      const response = await assertResponse(
        handleUnkeyRoute(req, '/v2/keys.createKey')
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error.code).toBe('UNAUTHORIZED')
    })

    it('returns 429 rate limited error', async () => {
      const req = createErrorRequest('/v2/keys.createKey', '429')
      const response = await assertResponse(
        handleUnkeyRoute(req, '/v2/keys.createKey')
      )
      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error.code).toBe('RATE_LIMITED')
      expect(body.error.message).toBe('Rate Limit Exceeded')
    })

    it('uses custom error message when X-Mock-Error-Message is set', async () => {
      const req = createErrorRequest(
        '/v2/keys.createKey',
        '500',
        'Custom error message'
      )
      const response = await assertResponse(
        handleUnkeyRoute(req, '/v2/keys.createKey')
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.message).toBe('Custom error message')
    })

    it('includes meta.requestId in error response', async () => {
      const req = createErrorRequest('/v2/keys.createKey', '500')
      const response = await assertResponse(
        handleUnkeyRoute(req, '/v2/keys.createKey')
      )
      const body = await response.json()
      expect(body.meta.requestId).toMatch(/^req_error_/)
    })
  })
})
