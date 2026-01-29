import { describe, expect, it } from 'bun:test'
import { handleHealth } from './health'

describe('handleHealth', () => {
  it('returns a Response with status 200', () => {
    const response = handleHealth('test-service')
    expect(response.status).toBe(200)
  })

  it('returns Content-Type application/json header', () => {
    const response = handleHealth('test-service')
    expect(response.headers.get('Content-Type')).toBe(
      'application/json'
    )
  })

  it('returns JSON body with status "ok"', async () => {
    const response = handleHealth('test-service')
    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  it('includes the service name in the response body', async () => {
    const response = handleHealth('svix')
    const body = await response.json()
    expect(body.service).toBe('svix')
  })

  it('includes an ISO timestamp in the response body', async () => {
    const response = handleHealth('test-service')
    const body = await response.json()
    expect(typeof body.timestamp).toBe('string')
    // Verify it's a valid ISO date string
    const date = new Date(body.timestamp)
    expect(date.toISOString()).toBe(body.timestamp)
  })

  it('returns different timestamps for different service names', async () => {
    const response1 = handleHealth('service-a')
    const response2 = handleHealth('service-b')
    const body1 = await response1.json()
    const body2 = await response2.json()
    expect(body1.service).toBe('service-a')
    expect(body2.service).toBe('service-b')
  })
})
