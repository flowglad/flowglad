import { beforeAll } from 'vitest'
import { seedDatabase } from './seedDatabase'

// NO MSW servers - we want real API calls

// Enable integration test mode for Stripe client
// This allows the stripe() function to use real API keys instead of fake test keys
process.env.STRIPE_INTEGRATION_TEST_MODE = 'true'

// Enable integration test mode for Redis client
// This allows the redis() function to use real Upstash connection instead of test stub
process.env.REDIS_INTEGRATION_TEST_MODE = 'true'

beforeAll(async () => {
  await seedDatabase()
})
