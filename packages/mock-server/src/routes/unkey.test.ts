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
function assertResponse(response: Response | null): Response {
  expect(response).toBeInstanceOf(Response)
  if (!response) {
    throw new Error('Expected Response but got null')
  }
  return response
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
    const response = assertResponse(
      handleUnkeyRoute(req, '/v2/keys.createKey')
    )
    const body = await response.json()
    expect(body.data.key).toMatch(/^unkey_mock_key_/)
    expect(body.data.keyId).toMatch(/^key_mock123_/)
  })

  it('routes POST /v2/keys.verifyKey to handleVerifyKeyV2', async () => {
    const req = createPostRequest('/v2/keys.verifyKey')
    const response = assertResponse(
      handleUnkeyRoute(req, '/v2/keys.verifyKey')
    )
    const body = await response.json()
    expect(body.data.valid).toBe(true)
    expect(body.data.code).toBe('VALID')
  })

  it('routes POST /v2/keys.deleteKey to handleDeleteKeyV2', async () => {
    const req = createPostRequest('/v2/keys.deleteKey')
    const response = assertResponse(
      handleUnkeyRoute(req, '/v2/keys.deleteKey')
    )
    const body = await response.json()
    expect(body.data).toEqual({})
  })

  it('routes POST /v2/keys.updateKey to handleUpdateKeyV2', async () => {
    const req = createPostRequest('/v2/keys.updateKey')
    const response = assertResponse(
      handleUnkeyRoute(req, '/v2/keys.updateKey')
    )
    const body = await response.json()
    expect(body.meta.requestId).toMatch(/^req_/)
  })

  it('routes POST /v1/keys.verifyKey to handleVerifyKeyV1', async () => {
    const req = createPostRequest('/v1/keys.verifyKey')
    const response = assertResponse(
      handleUnkeyRoute(req, '/v1/keys.verifyKey')
    )
    const body = await response.json()
    expect(body.valid).toBe(true)
    expect(body.ownerId).toMatch(/^owner_mock_id_/)
  })

  it('returns null for GET requests', () => {
    const req = createGetRequest('/v2/keys.createKey')
    const response = handleUnkeyRoute(req, '/v2/keys.createKey')
    expect(response).toBeNull()
  })

  it('returns null for unknown routes', () => {
    const req = createPostRequest('/v2/keys.unknownEndpoint')
    const response = handleUnkeyRoute(req, '/v2/keys.unknownEndpoint')
    expect(response).toBeNull()
  })

  it('returns null for root path', () => {
    const req = createPostRequest('/')
    const response = handleUnkeyRoute(req, '/')
    expect(response).toBeNull()
  })
})
