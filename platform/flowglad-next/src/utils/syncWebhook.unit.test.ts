import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { HttpResponse, http } from 'msw'
import { server } from '../../mocks/server'
import {
  createSyncWebhookPayload,
  pushSyncNotification,
  type SyncWebhookPayload,
  validateWebhookUrl,
  type WebhookConfig,
} from './syncWebhook'
import {
  generateSigningSecret,
  SIGNATURE_HEADER,
} from './webhookSignature'

describe('syncWebhook', () => {
  const testSecret = generateSigningSecret()
  const testUrl = 'https://example.com/webhook'

  describe('validateWebhookUrl', () => {
    describe('in production mode', () => {
      it('accepts valid HTTPS URLs', () => {
        const result = validateWebhookUrl(
          'https://example.com/webhook',
          true
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('rejects HTTP URLs', () => {
        const result = validateWebhookUrl(
          'http://example.com/webhook',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe(
          'Webhook URL must use HTTPS in production'
        )
      })

      it('rejects localhost URLs', () => {
        const result = validateWebhookUrl(
          'https://localhost:3000/webhook',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe(
          'Localhost URLs are not allowed in production'
        )
      })

      it('rejects 127.0.0.1 URLs', () => {
        const result = validateWebhookUrl(
          'https://127.0.0.1:3000/webhook',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe(
          'Localhost URLs are not allowed in production'
        )
      })
    })

    describe('in development mode', () => {
      it('accepts HTTP localhost URLs', () => {
        const result = validateWebhookUrl(
          'http://localhost:3000/webhook',
          false
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('accepts HTTP 127.0.0.1 URLs', () => {
        const result = validateWebhookUrl(
          'http://127.0.0.1:3000/webhook',
          false
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('accepts HTTPS URLs', () => {
        const result = validateWebhookUrl(
          'https://example.com/webhook',
          false
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('rejects HTTP URLs for non-localhost hosts', () => {
        const result = validateWebhookUrl(
          'http://example.com/webhook',
          false
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Non-localhost URLs must use HTTPS')
      })
    })

    it('rejects invalid URL formats', () => {
      const result = validateWebhookUrl('not-a-url', false)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid URL format')
    })

    it('rejects empty string', () => {
      const result = validateWebhookUrl('', false)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid URL format')
    })
  })

  describe('createSyncWebhookPayload', () => {
    it('creates payload with current timestamp', () => {
      const before = new Date().toISOString()

      const payload = createSyncWebhookPayload({
        scopeId: 'test-scope',
        latestSequence: '1700000000000-0',
        eventCount: 5,
      })

      const after = new Date().toISOString()

      expect(payload.scopeId).toBe('test-scope')
      expect(payload.latestSequence).toBe('1700000000000-0')
      expect(payload.eventCount).toBe(5)
      expect(payload.timestamp >= before).toBe(true)
      expect(payload.timestamp <= after).toBe(true)
    })
  })

  describe('pushSyncNotification', () => {
    let receivedRequests: Array<{
      body: unknown
      headers: Record<string, string>
    }> = []

    beforeEach(() => {
      receivedRequests = []
    })

    afterEach(() => {
      server.resetHandlers()
    })

    const createTestPayload = (): SyncWebhookPayload => ({
      scopeId: 'test-scope-id',
      latestSequence: '1700000000000-0',
      timestamp: new Date().toISOString(),
      eventCount: 3,
    })

    const createTestConfig = (): WebhookConfig => ({
      url: testUrl,
      secret: testSecret,
    })

    it('sends POST with correct payload and signature header on successful delivery', async () => {
      server.use(
        http.post(testUrl, async ({ request }) => {
          const body = await request.json()
          receivedRequests.push({
            body,
            headers: {
              'content-type':
                request.headers.get('content-type') || '',
              [SIGNATURE_HEADER.toLowerCase()]:
                request.headers.get(SIGNATURE_HEADER) || '',
            },
          })
          return HttpResponse.json(
            { received: true },
            { status: 200 }
          )
        })
      )

      const config = createTestConfig()
      const payload = createTestPayload()

      const result = await pushSyncNotification(config, payload)

      expect(result.success).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.attempts).toBe(1)
      expect(receivedRequests).toHaveLength(1)

      const received = receivedRequests[0]
      expect(received.body).toEqual(payload)
      expect(received.headers['content-type']).toBe(
        'application/json'
      )
      expect(
        received.headers[SIGNATURE_HEADER.toLowerCase()]
      ).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    })

    it('retries on transient 500 failures with exponential backoff', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          // Fail first 2 attempts with 500, then succeed
          if (attemptCount < 3) {
            return HttpResponse.json(
              { error: 'Internal error' },
              { status: 500 }
            )
          }
          return HttpResponse.json(
            { received: true },
            { status: 200 }
          )
        })
      )

      const config = createTestConfig()
      const payload = createTestPayload()

      const result = await pushSyncNotification(config, payload, {
        maxRetries: 5,
        initialDelayMs: 10, // Fast delays for testing
        maxDelayMs: 100,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(3) // 2 failures + 1 success
      expect(attemptCount).toBe(3)
    })

    it('gives up after max retries and returns failure result', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          return HttpResponse.json(
            { error: 'Always fails' },
            { status: 503 }
          )
        })
      )

      const config = createTestConfig()
      const payload = createTestPayload()

      const result = await pushSyncNotification(config, payload, {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(4) // Initial + 3 retries
      expect(result.statusCode).toBe(503)
      expect(result.error).toMatch(/HTTP 503/)
      expect(attemptCount).toBe(4)
    })

    it('does not retry on 4xx client errors (except 408 and 429)', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          return HttpResponse.json(
            { error: 'Bad Request' },
            { status: 400 }
          )
        })
      )

      const config = createTestConfig()
      const payload = createTestPayload()

      const result = await pushSyncNotification(config, payload, {
        maxRetries: 5,
        initialDelayMs: 10,
      })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(1) // No retries
      expect(result.statusCode).toBe(400)
      expect(result.error).toMatch(/Client error: 400/)
      expect(attemptCount).toBe(1)
    })

    it('does not retry on 401 Unauthorized', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          return HttpResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        })
      )

      const result = await pushSyncNotification(
        createTestConfig(),
        createTestPayload(),
        { maxRetries: 5, initialDelayMs: 10 }
      )

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(1)
      expect(result.statusCode).toBe(401)
      expect(attemptCount).toBe(1)
    })

    it('does not retry on 404 Not Found', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          return HttpResponse.json(
            { error: 'Not Found' },
            { status: 404 }
          )
        })
      )

      const result = await pushSyncNotification(
        createTestConfig(),
        createTestPayload(),
        { maxRetries: 5, initialDelayMs: 10 }
      )

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(1)
      expect(attemptCount).toBe(1)
    })

    it('retries on 408 Request Timeout', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          if (attemptCount < 2) {
            return HttpResponse.json(
              { error: 'Timeout' },
              { status: 408 }
            )
          }
          return HttpResponse.json(
            { received: true },
            { status: 200 }
          )
        })
      )

      const result = await pushSyncNotification(
        createTestConfig(),
        createTestPayload(),
        { maxRetries: 3, initialDelayMs: 10 }
      )

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(attemptCount).toBe(2)
    })

    it('retries on 429 Too Many Requests', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          if (attemptCount < 2) {
            return HttpResponse.json(
              { error: 'Rate limited' },
              { status: 429 }
            )
          }
          return HttpResponse.json(
            { received: true },
            { status: 200 }
          )
        })
      )

      const result = await pushSyncNotification(
        createTestConfig(),
        createTestPayload(),
        { maxRetries: 3, initialDelayMs: 10 }
      )

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(attemptCount).toBe(2)
    })

    it('retries on network errors and eventually gives up', async () => {
      let attemptCount = 0

      server.use(
        http.post(testUrl, () => {
          attemptCount++
          // Return network error for all attempts
          return HttpResponse.error()
        })
      )

      const result = await pushSyncNotification(
        createTestConfig(),
        createTestPayload(),
        { maxRetries: 2, initialDelayMs: 10 }
      )

      // Network errors should trigger retries until max is reached
      expect(result.success).toBe(false)
      expect(attemptCount).toBe(3) // Initial + 2 retries
      expect(result.attempts).toBe(3)
    })

    it('accepts 201 and 204 as successful responses', async () => {
      server.use(
        http.post(testUrl, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const result = await pushSyncNotification(
        createTestConfig(),
        createTestPayload()
      )

      expect(result.success).toBe(true)
      expect(result.statusCode).toBe(204)
      expect(result.attempts).toBe(1)
    })
  })
})
