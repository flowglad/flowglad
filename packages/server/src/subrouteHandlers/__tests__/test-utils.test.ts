import { describe, expect, it } from 'vitest'
import {
  assert200Success,
  assert400BadRequest,
  assert401Unauthorized,
  assert403Forbidden,
  assert404NotFound,
  assert405MethodNotAllowed,
  assert500Error,
  assertHandlerResponse,
  jsonMessageContains,
  jsonMessageMatches,
} from './test-utils'

describe('test-utils', () => {
  describe('assertHandlerResponse', () => {
    it('asserts status, error, and data correctly for success response', () => {
      const mockResponse = {
        status: 200,
        data: { id: '1', name: 'Test' },
      }

      // Should not throw
      assertHandlerResponse(mockResponse, {
        status: 200,
        error: 'undefined',
        data: { id: '1', name: 'Test' },
      })
    })

    it('asserts error.code and error.json correctly for error response', () => {
      const mockResponse = {
        status: 500,
        error: {
          code: 'fail',
          json: { message: 'oops' },
        },
        data: {},
      }

      // Should not throw
      assertHandlerResponse(mockResponse, {
        status: 500,
        error: {
          code: 'fail',
          json: { message: 'oops' },
        },
        data: {},
      })
    })

    it('supports matcher functions for error.json', () => {
      const mockResponse = {
        status: 404,
        error: {
          code: '404',
          json: { message: 'Customer cust_123 not found' },
        },
        data: {},
      }

      // Should not throw when using matcher function
      assertHandlerResponse(mockResponse, {
        status: 404,
        error: {
          code: '404',
          json: (json) => {
            expect(json.message).toContain('not found')
          },
        },
        data: {},
      })
    })

    it('supports matcher functions for data', () => {
      const mockResponse = {
        status: 200,
        data: { items: [1, 2, 3], total: 3 },
      }

      // Should not throw when using matcher function
      assertHandlerResponse(mockResponse, {
        status: 200,
        error: 'undefined',
        data: (data) => {
          expect(data.items).toHaveLength(3)
          expect(data.total).toBe(3)
        },
      })
    })

    it('does not check error when error is not specified in expected', () => {
      const mockResponse = {
        status: 200,
        error: { code: 'some_error', json: {} },
        data: { id: '1' },
      }

      // Should not throw - error is present but not checked
      assertHandlerResponse(mockResponse, {
        status: 200,
        data: { id: '1' },
      })
    })

    it('does not check data when data is not specified in expected', () => {
      const mockResponse = {
        status: 500,
        error: { code: 'fail', json: {} },
        data: { unexpected: 'data' },
      }

      // Should not throw - data is present but not checked
      assertHandlerResponse(mockResponse, {
        status: 500,
        error: { code: 'fail', json: {} },
      })
    })
  })

  describe('assert405MethodNotAllowed', () => {
    it('asserts standard 405 format by default', () => {
      const mockResponse = {
        status: 405,
        error: {
          code: 'Method not allowed',
          json: {},
        },
        data: {},
      }

      // Should not throw
      assert405MethodNotAllowed(mockResponse)
    })

    it('asserts standard 405 format when variant is "standard"', () => {
      const mockResponse = {
        status: 405,
        error: {
          code: 'Method not allowed',
          json: {},
        },
        data: {},
      }

      // Should not throw
      assert405MethodNotAllowed(mockResponse, 'standard')
    })

    it('asserts numbered 405 format when variant is "numbered"', () => {
      const mockResponse = {
        status: 405,
        error: {
          code: '405',
          json: { message: 'Method not allowed' },
        },
        data: {},
      }

      // Should not throw
      assert405MethodNotAllowed(mockResponse, 'numbered')
    })
  })

  describe('assert200Success', () => {
    it('asserts status 200, undefined error, and exact data match', () => {
      const mockResponse = {
        status: 200,
        data: { id: 'cs_123', url: 'https://example.com' },
      }

      // Should not throw
      assert200Success(mockResponse, {
        id: 'cs_123',
        url: 'https://example.com',
      })
    })

    it('works with empty data object', () => {
      const mockResponse = {
        status: 200,
        data: {},
      }

      // Should not throw
      assert200Success(mockResponse, {})
    })

    it('works with complex nested data', () => {
      const mockResponse = {
        status: 200,
        data: {
          subscription: { id: 'sub_123', status: 'active' },
          items: [{ id: 'si_1' }, { id: 'si_2' }],
        },
      }

      // Should not throw
      assert200Success(mockResponse, {
        subscription: { id: 'sub_123', status: 'active' },
        items: [{ id: 'si_1' }, { id: 'si_2' }],
      })
    })
  })

  describe('assert500Error', () => {
    it('asserts status 500 with specific error code and message', () => {
      const mockResponse = {
        status: 500,
        error: {
          code: 'my_error_code',
          json: { message: 'My error message' },
        },
        data: {},
      }

      // Should not throw
      assert500Error(
        mockResponse,
        'my_error_code',
        'My error message'
      )
    })

    it('works with different error codes', () => {
      const mockResponse = {
        status: 500,
        error: {
          code: 'subscription_cancel_failed',
          json: { message: 'Subscription already canceled' },
        },
        data: {},
      }

      // Should not throw
      assert500Error(
        mockResponse,
        'subscription_cancel_failed',
        'Subscription already canceled'
      )
    })
  })

  describe('assert401Unauthorized', () => {
    it('asserts status 401 with Unauthorized error', () => {
      const mockResponse = {
        status: 401,
        error: {
          code: '401',
          json: { message: 'Unauthorized' },
        },
        data: {},
      }

      // Should not throw
      assert401Unauthorized(mockResponse)
    })
  })

  describe('assert403Forbidden', () => {
    it('asserts status 403 with forbidden error and custom message', () => {
      const mockResponse = {
        status: 403,
        error: {
          code: 'forbidden',
          json: {
            message:
              "Subscription sub_123 is not found among the customer's current subscriptions",
          },
        },
        data: {},
      }

      // Should not throw
      assert403Forbidden(
        mockResponse,
        "Subscription sub_123 is not found among the customer's current subscriptions"
      )
    })
  })

  describe('assert404NotFound', () => {
    it('asserts status 404 with not found error and custom message', () => {
      const mockResponse = {
        status: 404,
        error: {
          code: '404',
          json: { message: 'Customer cust_123 not found' },
        },
        data: {},
      }

      // Should not throw
      assert404NotFound(mockResponse, 'Customer cust_123 not found')
    })
  })

  describe('assert400BadRequest', () => {
    it('asserts status 400 with custom error code and message', () => {
      const mockResponse = {
        status: 400,
        error: {
          code: 'missing_subscription_id',
          json: {
            message:
              'subscriptionId required: no current subscription found',
          },
        },
        data: {},
      }

      // Should not throw
      assert400BadRequest(
        mockResponse,
        'missing_subscription_id',
        'subscriptionId required: no current subscription found'
      )
    })

    it('works with different error codes', () => {
      const mockResponse = {
        status: 400,
        error: {
          code: 'validation_error',
          json: { message: 'Invalid input' },
        },
        data: {},
      }

      // Should not throw
      assert400BadRequest(
        mockResponse,
        'validation_error',
        'Invalid input'
      )
    })
  })

  describe('jsonMessageContains', () => {
    it('creates a matcher that checks message substring', () => {
      const json = { message: 'Customer cust_123 not found' }
      const matcher = jsonMessageContains('not found')

      // Should not throw
      matcher(json)
    })

    it('works with substring at the beginning', () => {
      const json = { message: 'Customer cust_123 not found' }
      const matcher = jsonMessageContains('Customer')

      // Should not throw
      matcher(json)
    })

    it('works with substring in the middle', () => {
      const json = { message: 'Customer cust_123 not found' }
      const matcher = jsonMessageContains('cust_123')

      // Should not throw
      matcher(json)
    })

    it('can be used with assertHandlerResponse', () => {
      const mockResponse = {
        status: 404,
        error: {
          code: '404',
          json: {
            message: 'Resource res_abc123 not found in database',
          },
        },
        data: {},
      }

      // Should not throw when using jsonMessageContains in assertHandlerResponse
      assertHandlerResponse(mockResponse, {
        status: 404,
        error: {
          code: '404',
          json: jsonMessageContains('not found'),
        },
        data: {},
      })
    })
  })

  describe('jsonMessageMatches', () => {
    it('creates a matcher that checks message matches regex', () => {
      const json = { message: 'Customer cust_123 not found' }
      const matcher = jsonMessageMatches(/cust_\d+/)

      // Should not throw
      matcher(json)
    })

    it('works with complex regex patterns', () => {
      const json = { message: 'Error at line 42: unexpected token' }
      const matcher = jsonMessageMatches(/line \d+/)

      // Should not throw
      matcher(json)
    })

    it('can be used with assertHandlerResponse', () => {
      const mockResponse = {
        status: 500,
        error: {
          code: 'internal_error',
          json: {
            message: 'Failed to process subscription sub_xyz789',
          },
        },
        data: {},
      }

      // Should not throw when using jsonMessageMatches in assertHandlerResponse
      assertHandlerResponse(mockResponse, {
        status: 500,
        error: {
          code: 'internal_error',
          json: jsonMessageMatches(/sub_[a-z0-9]+/),
        },
        data: {},
      })
    })
  })
})
