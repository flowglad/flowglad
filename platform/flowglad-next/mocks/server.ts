/**
 * MSW Server Configuration
 *
 * MSW runs in strict mode to catch unhandled requests.
 * All external service requests are passed through to mock server containers.
 *
 * Mock server containers (via docker-compose.test.yml):
 * - stripe-mock (localhost:12111) - Stripe API
 * - flowglad-mock-server (localhost:9001-9006) - Svix, Unkey, Trigger, Redis, Resend, Cloudflare
 */
import { http, passthrough } from 'msw'
import { setupServer } from 'msw/node'

// Passthrough handlers for mock server containers
// These let requests reach the actual containers instead of being intercepted by MSW
const stripeMockPassthrough = http.all(
  'http://localhost:12111/*',
  () => passthrough()
)
const svixMockPassthrough = http.all('http://localhost:9001/*', () =>
  passthrough()
)
const unkeyMockPassthrough = http.all('http://localhost:9002/*', () =>
  passthrough()
)
const triggerMockPassthrough = http.all(
  'http://localhost:9003/*',
  () => passthrough()
)
const redisMockPassthrough = http.all('http://localhost:9004/*', () =>
  passthrough()
)
const resendMockPassthrough = http.all(
  'http://localhost:9005/*',
  () => passthrough()
)
const cloudflareMockPassthrough = http.all(
  'http://localhost:9006/*',
  () => passthrough()
)

export const server = setupServer(
  stripeMockPassthrough,
  svixMockPassthrough,
  unkeyMockPassthrough,
  triggerMockPassthrough,
  redisMockPassthrough,
  resendMockPassthrough,
  cloudflareMockPassthrough
)
