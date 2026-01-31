import { describe, expect, it } from 'bun:test'
import { handleRedisRoute } from './redis'

function createRedisRequest(
  command: unknown,
  headers?: Record<string, string>
): Request {
  return new Request('http://localhost:9004/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(command),
  })
}

describe('handleRedisRoute', () => {
  describe('GET command', () => {
    it('returns null for GET (cache miss)', async () => {
      const req = createRedisRequest(['GET', 'some-key'])
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeInstanceOf(Response)
      expect(response!.status).toBe(200)
      const body = await response!.json()
      expect(body.result).toBeNull()
    })
  })

  describe('SET command', () => {
    it('returns OK for SET', async () => {
      const req = createRedisRequest(['SET', 'key', 'value'])
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeInstanceOf(Response)
      const body = await response!.json()
      expect(body.result).toBe('OK')
    })

    it('returns OK for SET with expiry', async () => {
      const req = createRedisRequest([
        'SET',
        'key',
        'value',
        'EX',
        '3600',
      ])
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeInstanceOf(Response)
      const body = await response!.json()
      expect(body.result).toBe('OK')
    })
  })

  describe('DEL command', () => {
    it('returns 1 for DEL (success count)', async () => {
      const req = createRedisRequest(['DEL', 'some-key'])
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeInstanceOf(Response)
      const body = await response!.json()
      expect(body.result).toBe(1)
    })
  })

  describe('pipeline commands', () => {
    it('handles pipeline of multiple commands', async () => {
      const req = createRedisRequest([
        ['SET', 'key1', 'value1'],
        ['GET', 'key2'],
        ['DEL', 'key3'],
      ])
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeInstanceOf(Response)
      // Upstash pipeline returns array of {result: value} objects at top level
      const body = await response!.json()
      expect(body).toEqual([
        { result: 'OK' },
        { result: null },
        { result: 1 },
      ])
    })
  })

  describe('other commands', () => {
    it('returns PONG for PING', async () => {
      const req = createRedisRequest(['PING'])
      const response = await handleRedisRoute(req, '/')
      const body = await response!.json()
      expect(body.result).toBe('PONG')
    })

    it('returns 0 for EXISTS (key not found)', async () => {
      const req = createRedisRequest(['EXISTS', 'key'])
      const response = await handleRedisRoute(req, '/')
      const body = await response!.json()
      expect(body.result).toBe(0)
    })

    it('returns -2 for TTL (key not found)', async () => {
      const req = createRedisRequest(['TTL', 'key'])
      const response = await handleRedisRoute(req, '/')
      const body = await response!.json()
      expect(body.result).toBe(-2)
    })

    it('returns 1 for INCR', async () => {
      const req = createRedisRequest(['INCR', 'counter'])
      const response = await handleRedisRoute(req, '/')
      const body = await response!.json()
      expect(body.result).toBe(1)
    })

    it('returns empty array for KEYS', async () => {
      const req = createRedisRequest(['KEYS', '*'])
      const response = await handleRedisRoute(req, '/')
      const body = await response!.json()
      expect(body.result).toEqual([])
    })
  })

  describe('routing', () => {
    it('returns null for GET requests', async () => {
      const req = new Request('http://localhost:9004/', {
        method: 'GET',
      })
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeNull()
    })

    it('returns null for non-root paths (except /pipeline)', async () => {
      const req = createRedisRequest(['GET', 'key'])
      const response = await handleRedisRoute(req, '/some/other/path')
      expect(response).toBeNull()
    })

    it('handles /pipeline path', async () => {
      const req = new Request('http://localhost:9004/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['SET', 'key', 'value'],
          ['GET', 'key'],
        ]),
      })
      const response = await handleRedisRoute(req, '/pipeline')
      expect(response).toBeInstanceOf(Response)
      // Upstash pipeline returns array of {result: value} objects at top level
      const body = await response!.json()
      expect(body).toEqual([{ result: 'OK' }, { result: null }])
    })
  })

  describe('error simulation', () => {
    it('returns error when X-Mock-Error header is set', async () => {
      const req = createRedisRequest(['GET', 'key'], {
        'X-Mock-Error': '500',
      })
      const response = await handleRedisRoute(req, '/')
      expect(response).toBeInstanceOf(Response)
      expect(response!.status).toBe(500)
      const body = await response!.json()
      expect(body.error).toBe('Internal Server Error')
    })

    it('returns custom error message', async () => {
      const req = createRedisRequest(['GET', 'key'], {
        'X-Mock-Error': '503',
        'X-Mock-Error-Message': 'Redis unavailable',
      })
      const response = await handleRedisRoute(req, '/')
      expect(response!.status).toBe(503)
      const body = await response!.json()
      expect(body.error).toBe('Redis unavailable')
    })
  })

  describe('invalid requests', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = new Request('http://localhost:9004/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
      const response = await handleRedisRoute(req, '/')
      expect(response!.status).toBe(400)
      const body = await response!.json()
      expect(body.error).toBe('Invalid command format')
    })

    it('returns 400 for non-array body', async () => {
      const req = new Request('http://localhost:9004/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'GET' }),
      })
      const response = await handleRedisRoute(req, '/')
      expect(response!.status).toBe(400)
      const body = await response!.json()
      expect(body.error).toBe('Invalid command format')
    })
  })
})
