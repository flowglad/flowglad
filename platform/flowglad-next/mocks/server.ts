/**
 * Combined MSW server with all handlers
 *
 * MSW recommends using a single server instance with all handlers combined.
 * Having multiple separate servers can cause conflicts where only one server's
 * handlers are active at a time.
 *
 * Note: Stripe API calls are handled by stripe-mock (docker container) instead of MSW.
 * The Stripe SDK is configured to point to stripe-mock in test mode via src/utils/stripe.ts.
 */
import { HttpResponse, http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { svixHandlers } from './svixServer'
import { triggerHandlers } from './triggerServer'
import { unkeyHandlers } from './unkeyServer'

// Passthrough handler for stripe-mock - let requests reach the actual container
const stripeMockPassthrough = http.all(
  'http://localhost:12111/*',
  () => passthrough()
)

// Mock handler for Upstash Redis - returns success responses for common operations
// This prevents tests from needing real Redis while still allowing code to run
const upstashHandler = http.post(
  'https://*.upstash.io/*',
  async ({ request }) => {
    const body = (await request.json()) as string[]
    const command = body[0]?.toLowerCase()

    // Return appropriate responses for Redis commands
    if (command === 'smembers' || command === 'lrange') {
      // Return empty array for set/list members
      return HttpResponse.json({ result: [] })
    }
    if (
      command === 'sadd' ||
      command === 'srem' ||
      command === 'del' ||
      command === 'expire' ||
      command === 'lpush' ||
      command === 'ltrim'
    ) {
      // Return 1 for successful mutations
      return HttpResponse.json({ result: 1 })
    }
    if (command === 'get' || command === 'hget') {
      // Return null for get operations
      return HttpResponse.json({ result: null })
    }
    if (
      command === 'set' ||
      command === 'hset' ||
      command === 'setex'
    ) {
      // Return OK for set operations
      return HttpResponse.json({ result: 'OK' })
    }

    // Default: return empty/success response
    return HttpResponse.json({ result: null })
  }
)

export const server = setupServer(
  stripeMockPassthrough,
  upstashHandler,
  ...svixHandlers,
  ...triggerHandlers,
  ...unkeyHandlers
)
