import { expect } from 'vitest'

/**
 * The response shape returned by all subroute handlers.
 */
type HandlerResponse = {
  status: number
  error?: {
    code: string
    json: Record<string, unknown>
  }
  data: Record<string, unknown>
}

/**
 * Expected response configuration for assertHandlerResponse.
 *
 * - status: Required HTTP status code
 * - error: Either 'undefined' (success case), or an object with:
 *   - code: The expected error code string
 *   - json: Expected json object OR a matcher function for flexible assertions
 * - data: Expected data object OR a matcher function
 */
type ExpectedResponse = {
  status: number
  error?:
    | 'undefined'
    | {
        code: string
        json?:
          | Record<string, unknown>
          | ((json: Record<string, unknown>) => void)
      }
  data?:
    | Record<string, unknown>
    | ((data: Record<string, unknown>) => void)
}

/**
 * Core assertion helper that validates handler response against expected shape.
 */
export const assertHandlerResponse = (
  actual: HandlerResponse,
  expected: ExpectedResponse
): void => {
  expect(actual.status).toBe(expected.status)

  if (expected.error === 'undefined') {
    expect(actual.error).toBeUndefined()
  } else if (expected.error !== undefined) {
    expect(actual.error).not.toBeUndefined()
    expect(actual.error!.code).toBe(expected.error.code)

    if (expected.error.json !== undefined) {
      if (typeof expected.error.json === 'function') {
        expected.error.json(actual.error!.json)
      } else {
        expect(actual.error!.json).toEqual(expected.error.json)
      }
    }
  }

  if (expected.data !== undefined) {
    if (typeof expected.data === 'function') {
      expected.data(actual.data)
    } else {
      expect(actual.data).toEqual(expected.data)
    }
  }
}

// ============================================================================
// PRESETS: Higher-order functions that return configured assertion calls
// ============================================================================

/**
 * Preset for 405 Method Not Allowed responses.
 *
 * Handles both error formats found in the codebase:
 * - 'standard': { code: 'Method not allowed', json: {} }
 * - 'numbered': { code: '405', json: { message: 'Method not allowed' } }
 */
export const assert405MethodNotAllowed = (
  actual: HandlerResponse,
  variant: 'standard' | 'numbered' = 'standard'
) => {
  assertHandlerResponse(actual, {
    status: 405,
    error:
      variant === 'standard'
        ? { code: 'Method not allowed', json: {} }
        : { code: '405', json: { message: 'Method not allowed' } },
    data: {},
  })
}

/**
 * Preset for 200 success responses.
 */
export const assert200Success = <T extends Record<string, unknown>>(
  actual: HandlerResponse,
  expectedData: T
) => {
  assertHandlerResponse(actual, {
    status: 200,
    error: 'undefined',
    data: expectedData,
  })
}

/**
 * Preset for 500 error responses with handler-specific error codes.
 */
export const assert500Error = (
  actual: HandlerResponse,
  errorCode: string,
  message: string
) => {
  assertHandlerResponse(actual, {
    status: 500,
    error: {
      code: errorCode,
      json: { message },
    },
    data: {},
  })
}

/**
 * Preset for 401 Unauthorized responses.
 */
export const assert401Unauthorized = (actual: HandlerResponse) => {
  assertHandlerResponse(actual, {
    status: 401,
    error: {
      code: '401',
      json: { message: 'Unauthorized' },
    },
    data: {},
  })
}

/**
 * Preset for 403 Forbidden responses with custom message.
 */
export const assert403Forbidden = (
  actual: HandlerResponse,
  message: string
) => {
  assertHandlerResponse(actual, {
    status: 403,
    error: {
      code: 'forbidden',
      json: { message },
    },
    data: {},
  })
}

/**
 * Preset for 404 Not Found responses with custom message.
 */
export const assert404NotFound = (
  actual: HandlerResponse,
  message: string
) => {
  assertHandlerResponse(actual, {
    status: 404,
    error: {
      code: '404',
      json: { message },
    },
    data: {},
  })
}

/**
 * Preset for 400 Bad Request responses with custom code and message.
 */
export const assert400BadRequest = (
  actual: HandlerResponse,
  errorCode: string,
  message: string
) => {
  assertHandlerResponse(actual, {
    status: 400,
    error: {
      code: errorCode,
      json: { message },
    },
    data: {},
  })
}

// ============================================================================
// MATCHER HELPERS: For flexible assertions on error.json or data
// ============================================================================

/**
 * Creates a matcher that checks if message contains a substring.
 */
export const jsonMessageContains = (substring: string) => {
  return (json: Record<string, unknown>) => {
    expect(json.message).not.toBeUndefined()
    expect(String(json.message)).toContain(substring)
  }
}

/**
 * Creates a matcher that checks if message matches a regex.
 */
export const jsonMessageMatches = (pattern: RegExp) => {
  return (json: Record<string, unknown>) => {
    expect(json.message).not.toBeUndefined()
    expect(String(json.message)).toMatch(pattern)
  }
}
