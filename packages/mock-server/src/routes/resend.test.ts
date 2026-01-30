import { describe, expect, it } from 'bun:test'
import { handleResendRoute, handleSendEmail } from './resend'

describe('handleSendEmail', () => {
  it('returns a response with an email ID', async () => {
    const response = handleSendEmail()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(typeof body.id).toBe('string')
    expect(body.id.length).toBeGreaterThan(0)
  })

  it('generates unique IDs for each call', async () => {
    const response1 = handleSendEmail()
    const response2 = handleSendEmail()
    const body1 = await response1.json()
    const body2 = await response2.json()
    expect(body1.id).not.toBe(body2.id)
  })
})

describe('handleResendRoute', () => {
  function createPostRequest(
    pathname: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Request {
    return new Request(`http://localhost:9005${pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer re_test_xxx',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  it('handles POST /emails', async () => {
    const req = createPostRequest('/emails', {
      from: 'test@example.com',
      to: 'recipient@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })
    const response = await handleResendRoute(req, '/emails')
    expect(response).toBeInstanceOf(Response)
    expect(response!.status).toBe(200)
    const body = await response!.json()
    expect(typeof body.id).toBe('string')
  })

  it('handles POST /emails/batch', async () => {
    const req = createPostRequest('/emails/batch', [
      { from: 'test@example.com', to: 'a@example.com', subject: 'A' },
      { from: 'test@example.com', to: 'b@example.com', subject: 'B' },
    ])
    const response = await handleResendRoute(req, '/emails/batch')
    expect(response).toBeInstanceOf(Response)
    expect(response!.status).toBe(200)
    const body = await response!.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBe(2)
  })

  it('returns null for GET requests', async () => {
    const req = new Request('http://localhost:9005/emails', {
      method: 'GET',
    })
    const response = await handleResendRoute(req, '/emails')
    expect(response).toBeNull()
  })

  it('returns null for unknown paths', async () => {
    const req = createPostRequest('/unknown')
    const response = await handleResendRoute(req, '/unknown')
    expect(response).toBeNull()
  })

  describe('error simulation', () => {
    it('returns error when X-Mock-Error header is set', async () => {
      const req = createPostRequest(
        '/emails',
        { from: 'test@example.com', to: 'to@example.com' },
        { 'X-Mock-Error': '429' }
      )
      const response = await handleResendRoute(req, '/emails')
      expect(response!.status).toBe(429)
      const body = await response!.json()
      expect(body.message).toBe('Rate Limit Exceeded')
    })

    it('returns custom error message', async () => {
      const req = createPostRequest(
        '/emails',
        {},
        {
          'X-Mock-Error': '500',
          'X-Mock-Error-Message': 'Resend service unavailable',
        }
      )
      const response = await handleResendRoute(req, '/emails')
      expect(response!.status).toBe(500)
      const body = await response!.json()
      expect(body.message).toBe('Resend service unavailable')
    })
  })
})
