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
import { http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { svixHandlers } from './svixServer'
import { triggerHandlers } from './triggerServer'
import { unkeyHandlers } from './unkeyServer'

// Passthrough handler for stripe-mock - let requests reach the actual container
const stripeMockPassthrough = http.all(
  'http://localhost:12111/*',
  () => passthrough()
)

export const server = setupServer(
  stripeMockPassthrough,
  ...svixHandlers,
  ...triggerHandlers,
  ...unkeyHandlers
)
