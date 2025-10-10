import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the @logtail/next module
vi.mock('@logtail/next', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock the core module
vi.mock('./core', () => ({
  default: {
    IS_PROD: true,
    IS_TEST: false,
    IS_DEV: false,
  },
  IS_DEV: false,
}))

// Mock OpenTelemetry
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn(() => null),
  },
  context: {},
}))

// Import logger after mocks are set up
import { logger } from './logger'
import { log as mockLogFunctions } from '@logtail/next'

describe('Logger with BetterStack Context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should include service context in log data', () => {
    logger.info('Test message', {
      service: 'webapp',
      customData: 'test',
    })

    expect(mockLogFunctions.info).toHaveBeenCalledWith(
      'Test message',
      expect.objectContaining({
        service: 'webapp',
        customData: 'test',
        deployment_env: 'production',
      })
    )
  })

  it('should include API environment context when provided', () => {
    logger.info('API request', {
      service: 'api',
      apiEnvironment: 'test',
      endpoint: '/api/test',
    })

    expect(mockLogFunctions.info).toHaveBeenCalledWith(
      'API request',
      expect.objectContaining({
        service: 'api',
        api_environment: 'test',
        endpoint: '/api/test',
        deployment_env: 'production',
      })
    )
  })

  it('should differentiate between live and test API environments', () => {
    // Test with live environment
    logger.info('Live API call', {
      service: 'api',
      apiEnvironment: 'live',
    })

    expect(mockLogFunctions.info).toHaveBeenCalledWith(
      'Live API call',
      expect.objectContaining({
        service: 'api',
        api_environment: 'live',
        deployment_env: 'production',
      })
    )

    // Clear mocks before next test
    vi.clearAllMocks()

    // Test with test environment
    logger.info('Test API call', {
      service: 'api',
      apiEnvironment: 'test',
    })

    expect(mockLogFunctions.info).toHaveBeenCalledWith(
      'Test API call',
      expect.objectContaining({
        service: 'api',
        api_environment: 'test',
        deployment_env: 'production',
      })
    )
  })

  it('should handle error logging with context', () => {
    const testError = new Error('Test error')

    logger.error(testError, {
      service: 'api',
      apiEnvironment: 'live',
      request_id: '123',
    })

    expect(mockLogFunctions.error).toHaveBeenCalledWith(
      'Test error',
      expect.objectContaining({
        service: 'api',
        api_environment: 'live',
        request_id: '123',
        error_name: 'Error',
        error_stack: expect.stringContaining('Error: Test error'),
        deployment_env: 'production',
      })
    )
  })

  it('should default to appropriate service context', () => {
    // When no service is specified, it should use the default
    logger.info('Default context test')

    expect(mockLogFunctions.info).toHaveBeenCalledWith(
      'Default context test',
      expect.objectContaining({
        service: expect.any(String), // Will be 'api' in node context
        deployment_env: 'production',
      })
    )
  })
})