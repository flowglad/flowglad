import { beforeAll } from 'vitest'
import { seedDatabase } from './seedDatabase'

// NO MSW servers - we want real API calls

beforeAll(async () => {
  await seedDatabase()
})
