import { afterAll, beforeAll } from 'vitest'

// This file is used to set up the test environment
// It will be executed before all tests

beforeAll(() => {
  // Set up any global test environment variables or configurations
  process.env.FLOWGLAD_BASE_URL =
    process.env.FLOWGLAD_BASE_URL || 'http://localhost:3000'
})

afterAll(() => {
  // Clean up any resources created during tests
})
