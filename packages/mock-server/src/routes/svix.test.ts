import { describe, expect, it } from 'bun:test'
import {
  handleCreateApp,
  handleCreateEndpoint,
  handleGetApp,
  handleGetEndpointSecret,
  handleSendMessage,
  handleSvixRoute,
  handleUpdateEndpoint,
} from './svix'

describe('handleCreateApp', () => {
  it('returns a 201 status with application data containing id, name, uid, and createdAt', async () => {
    const req = new Request('http://localhost:9001/api/v1/app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test App' }),
    })

    const response = await handleCreateApp(req)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe(
      'application/json'
    )
    expect(body.id).toMatch(/^app_mock_/)
    expect(body.name).toBe('Test App')
    expect(typeof body.uid).toBe('string')
    expect(body.uid.length).toBeGreaterThan(0)
    expect(new Date(body.createdAt).toISOString()).toBe(
      body.createdAt
    )
  })

  it('uses default name when no name is provided in the request body', async () => {
    const req = new Request('http://localhost:9001/api/v1/app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await handleCreateApp(req)
    const body = await response.json()

    expect(body.name).toBe('Mock Application')
  })

  it('uses provided uid when included in request body', async () => {
    const req = new Request('http://localhost:9001/api/v1/app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'custom-uid-123' }),
    })

    const response = await handleCreateApp(req)
    const body = await response.json()

    expect(body.uid).toBe('custom-uid-123')
  })
})

describe('handleGetApp', () => {
  it('returns a 200 status with application data for a given app ID', () => {
    const response = handleGetApp('app_mock_abc123')
    expect(response.status).toBe(200)
  })

  it('preserves the app ID if it starts with "app_"', async () => {
    const response = handleGetApp('app_mock_test123')
    const body = await response.json()

    expect(body.id).toBe('app_mock_test123')
    expect(body.name).toBe('Mock Application')
    expect(typeof body.uid).toBe('string')
    expect(new Date(body.createdAt).toISOString()).toBe(
      body.createdAt
    )
  })

  it('generates a mock app ID if provided ID does not start with "app_"', async () => {
    const response = handleGetApp('some-other-id')
    const body = await response.json()

    expect(body.id).toMatch(/^app_mock_/)
  })
})

describe('handleCreateEndpoint', () => {
  it('returns a 201 status with endpoint data containing id, url, uid, and createdAt', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/webhook' }),
      }
    )

    const response = await handleCreateEndpoint(req, 'app_123')
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe(
      'application/json'
    )
    expect(body.id).toMatch(/^ep_mock_/)
    expect(body.url).toBe('https://example.com/webhook')
    expect(typeof body.uid).toBe('string')
    expect(new Date(body.createdAt).toISOString()).toBe(
      body.createdAt
    )
  })

  it('uses default URL when no url is provided in the request body', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    const response = await handleCreateEndpoint(req, 'app_123')
    const body = await response.json()

    expect(body.url).toBe('https://mock-endpoint.com/webhook')
  })

  it('uses provided uid when included in request body', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: 'endpoint-uid-456' }),
      }
    )

    const response = await handleCreateEndpoint(req, 'app_123')
    const body = await response.json()

    expect(body.uid).toBe('endpoint-uid-456')
  })
})

describe('handleUpdateEndpoint', () => {
  it('returns a 200 status with updated endpoint data', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint/ep_mock_456',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://updated.com/webhook' }),
      }
    )

    const response = await handleUpdateEndpoint(
      req,
      'app_123',
      'ep_mock_456'
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.id).toBe('ep_mock_456')
    expect(body.url).toBe('https://updated.com/webhook')
    expect(typeof body.uid).toBe('string')
    expect(new Date(body.createdAt).toISOString()).toBe(
      body.createdAt
    )
  })

  it('preserves endpoint ID if it starts with "ep_"', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint/ep_existing',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    const response = await handleUpdateEndpoint(
      req,
      'app_123',
      'ep_existing'
    )
    const body = await response.json()

    expect(body.id).toBe('ep_existing')
  })

  it('generates a mock endpoint ID if provided ID does not start with "ep_"', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint/some-id',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    const response = await handleUpdateEndpoint(
      req,
      'app_123',
      'some-id'
    )
    const body = await response.json()

    expect(body.id).toMatch(/^ep_mock_/)
  })
})

describe('handleGetEndpointSecret', () => {
  it('returns a 200 status with a webhook secret key', () => {
    const response = handleGetEndpointSecret('app_123', 'ep_456')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'application/json'
    )
  })

  it('returns a key that starts with "whsec_mock_"', async () => {
    const response = handleGetEndpointSecret('app_123', 'ep_456')
    const body = await response.json()

    expect(body.key).toMatch(/^whsec_mock_/)
  })

  it('returns different keys on consecutive calls', async () => {
    const response1 = handleGetEndpointSecret('app_123', 'ep_456')
    const response2 = handleGetEndpointSecret('app_123', 'ep_456')
    const body1 = await response1.json()
    const body2 = await response2.json()

    expect(body1.key).not.toBe(body2.key)
  })
})

describe('handleSendMessage', () => {
  it('returns a 202 status with message data containing id, eventType, payload, and timestamp', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/msg',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'user.created',
          payload: { userId: '123' },
        }),
      }
    )

    const response = await handleSendMessage(req, 'app_123')
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(response.headers.get('Content-Type')).toBe(
      'application/json'
    )
    expect(body.id).toMatch(/^msg_/)
    expect(body.eventType).toBe('user.created')
    expect(body.payload).toEqual({ userId: '123' })
    expect(new Date(body.timestamp).toISOString()).toBe(
      body.timestamp
    )
  })

  it('uses default eventType when not provided', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/msg',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    const response = await handleSendMessage(req, 'app_123')
    const body = await response.json()

    expect(body.eventType).toBe('mock.event')
  })

  it('uses empty payload when not provided', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/msg',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'test.event' }),
      }
    )

    const response = await handleSendMessage(req, 'app_123')
    const body = await response.json()

    expect(body.payload).toEqual({})
  })
})

describe('handleSvixRoute', () => {
  it('returns null for unmatched routes', () => {
    const req = new Request('http://localhost:9001/unknown/path', {
      method: 'GET',
    })

    const response = handleSvixRoute(req, '/unknown/path')
    expect(response).toBeNull()
  })

  it('routes POST /api/v1/app to handleCreateApp', async () => {
    const req = new Request('http://localhost:9001/api/v1/app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Routed App' }),
    })

    const response = await handleSvixRoute(req, '/api/v1/app')
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.id).toMatch(/^app_mock_/)
    expect(body.name).toBe('Routed App')
  })

  it('routes GET /api/v1/app/:appId to handleGetApp', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_test123',
      {
        method: 'GET',
      }
    )

    const response = handleSvixRoute(req, '/api/v1/app/app_test123')
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.id).toBe('app_test123')
  })

  it('routes GET /api/v1/app/:appId with trailing slash', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_test123/',
      {
        method: 'GET',
      }
    )

    const response = handleSvixRoute(req, '/api/v1/app/app_test123/')
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.id).toBe('app_test123')
  })

  it('routes POST /api/v1/app/:appId/endpoint to handleCreateEndpoint', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://routed.com/webhook' }),
      }
    )

    const response = await handleSvixRoute(
      req,
      '/api/v1/app/app_123/endpoint'
    )
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.id).toMatch(/^ep_mock_/)
    expect(body.url).toBe('https://routed.com/webhook')
  })

  it('routes PATCH /api/v1/app/:appId/endpoint/:endpointId to handleUpdateEndpoint', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint/ep_456',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://patched.com/webhook' }),
      }
    )

    const response = await handleSvixRoute(
      req,
      '/api/v1/app/app_123/endpoint/ep_456'
    )
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.url).toBe('https://patched.com/webhook')
  })

  it('routes GET /api/v1/app/:appId/endpoint/:endpointId/secret to handleGetEndpointSecret', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/endpoint/ep_456/secret',
      { method: 'GET' }
    )

    const response = handleSvixRoute(
      req,
      '/api/v1/app/app_123/endpoint/ep_456/secret'
    )
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.key).toMatch(/^whsec_mock_/)
  })

  it('routes POST /api/v1/app/:appId/msg to handleSendMessage', async () => {
    const req = new Request(
      'http://localhost:9001/api/v1/app/app_123/msg',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'routed.event' }),
      }
    )

    const response = await handleSvixRoute(
      req,
      '/api/v1/app/app_123/msg'
    )
    expect(response).toBeInstanceOf(Response)

    const body = await (response as Response).json()
    expect(body.id).toMatch(/^msg_/)
    expect(body.eventType).toBe('routed.event')
  })

  it('returns null for wrong HTTP method on existing path', () => {
    const req = new Request('http://localhost:9001/api/v1/app', {
      method: 'GET',
    })

    const response = handleSvixRoute(req, '/api/v1/app')
    expect(response).toBeNull()
  })
})
