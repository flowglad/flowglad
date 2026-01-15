/**
 * Combined MSW server with all handlers
 *
 * MSW recommends using a single server instance with all handlers combined.
 * Having multiple separate servers can cause conflicts where only one server's
 * handlers are active at a time.
 */
import { setupServer } from 'msw/node'
import { stripeHandlers } from './stripeServer'
import { svixHandlers } from './svixServer'
import { triggerHandlers } from './triggerServer'
import { unkeyHandlers } from './unkeyServer'

export const server = setupServer(
  ...stripeHandlers,
  ...svixHandlers,
  ...triggerHandlers,
  ...unkeyHandlers
)
