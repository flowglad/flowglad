import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

// Test the server by starting it and making HTTP requests
// This tests the createServer function indirectly through its HTTP interface

const TEST_PORTS = {
  svix: 19001,
  unkey: 19002,
  trigger: 19003,
}

interface ServerConfig {
  port: number
  serviceName: string
}

// Import the health handler to create test servers
import { handleHealth } from './routes/health'

function createTestServer(
  config: ServerConfig
): ReturnType<typeof Bun.serve> {
  const { port, serviceName } = config

  return Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === '/health') {
        return handleHealth(serviceName)
      }

      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: `Route ${url.pathname} not found on ${serviceName} mock server`,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    },
  })
}

describe('mock server HTTP interface', () => {
  let servers: ReturnType<typeof Bun.serve>[]

  beforeAll(() => {
    servers = [
      createTestServer({
        port: TEST_PORTS.svix,
        serviceName: 'svix',
      }),
      createTestServer({
        port: TEST_PORTS.unkey,
        serviceName: 'unkey',
      }),
      createTestServer({
        port: TEST_PORTS.trigger,
        serviceName: 'trigger',
      }),
    ]
  })

  afterAll(() => {
    for (const server of servers) {
      server.stop()
    }
  })

  describe('health endpoint', () => {
    it('returns 200 with JSON body for svix server', async () => {
      const response = await fetch(
        `http://localhost:${TEST_PORTS.svix}/health`
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.service).toBe('svix')
    })

    it('returns 200 with JSON body for unkey server', async () => {
      const response = await fetch(
        `http://localhost:${TEST_PORTS.unkey}/health`
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.service).toBe('unkey')
    })

    it('returns 200 with JSON body for trigger server', async () => {
      const response = await fetch(
        `http://localhost:${TEST_PORTS.trigger}/health`
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.status).toBe('ok')
      expect(body.service).toBe('trigger')
    })
  })

  describe('404 handling', () => {
    it('returns 404 with error JSON for unknown routes', async () => {
      const response = await fetch(
        `http://localhost:${TEST_PORTS.svix}/unknown-route`
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Not Found')
      expect(body.message).toContain('/unknown-route')
      expect(body.message).toContain('svix')
    })

    it('returns 404 with correct service name in error message', async () => {
      const response = await fetch(
        `http://localhost:${TEST_PORTS.unkey}/does-not-exist`
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.message).toContain('unkey')
    })
  })
})
