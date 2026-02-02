/**
 * Error simulation utilities for mock server.
 *
 * Tests can trigger error responses by setting the `X-Mock-Error` header:
 *
 * - `X-Mock-Error: true` or `X-Mock-Error: 500` - Internal server error
 * - `X-Mock-Error: 404` - Not found
 * - `X-Mock-Error: 401` - Unauthorized
 * - `X-Mock-Error: 403` - Forbidden
 * - `X-Mock-Error: 429` - Rate limited
 * - `X-Mock-Error: timeout` - Simulates a timeout (5 second delay then 504)
 *
 * Custom error messages can be set via `X-Mock-Error-Message` header.
 */

export interface MockErrorConfig {
  enabled: boolean
  statusCode: number
  message: string
  isTimeout: boolean
}

/**
 * Parse error configuration from request headers.
 */
export function parseErrorConfig(
  req: Request
): MockErrorConfig | null {
  const errorHeader = req.headers.get('X-Mock-Error')

  if (!errorHeader) {
    return null
  }

  const customMessage = req.headers.get('X-Mock-Error-Message')
  const lowerHeader = errorHeader.toLowerCase()

  // Handle timeout simulation
  if (lowerHeader === 'timeout') {
    return {
      enabled: true,
      statusCode: 504,
      message: customMessage || 'Gateway Timeout',
      isTimeout: true,
    }
  }

  // Parse numeric status code or default to 500
  let statusCode = 500
  if (lowerHeader !== 'true') {
    const parsed = parseInt(errorHeader, 10)
    if (!Number.isNaN(parsed) && parsed >= 400 && parsed < 600) {
      statusCode = parsed
    }
  }

  // Default messages per status code
  const defaultMessages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Rate Limit Exceeded',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  }

  return {
    enabled: true,
    statusCode,
    message: customMessage || defaultMessages[statusCode] || 'Error',
    isTimeout: false,
  }
}

/**
 * Create an error response in the service's expected format.
 */
export function createErrorResponse(
  service: 'unkey' | 'svix' | 'trigger',
  config: MockErrorConfig
): Response {
  let body: unknown

  switch (service) {
    case 'unkey':
      // Unkey error format
      body = {
        meta: {
          requestId: `req_error_${Date.now()}`,
        },
        error: {
          code: getUnkeyErrorCode(config.statusCode),
          message: config.message,
        },
      }
      break

    case 'svix':
      // Svix error format
      body = {
        code: config.statusCode.toString(),
        detail: config.message,
      }
      break

    case 'trigger':
      // Trigger.dev error format
      body = {
        error: config.message,
        status: config.statusCode,
      }
      break
  }

  return new Response(JSON.stringify(body), {
    status: config.statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Map HTTP status codes to Unkey error codes.
 */
function getUnkeyErrorCode(statusCode: number): string {
  const codeMap: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_SERVER_ERROR',
  }
  return codeMap[statusCode] || 'INTERNAL_SERVER_ERROR'
}

/**
 * Delay helper for timeout simulation.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
