/**
 * TRPC Error Handler
 * Transforms database and application errors into user-friendly, actionable error messages
 */

import { TRPCError } from '@trpc/server'
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc'
import { NotFoundError } from '@/db/tableUtils'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError as DomainNotFoundError,
  TerminalStateError,
  ValidationError,
} from '@/errors'
import {
  extractPostgresError,
  parsePostgresError,
} from './postgresErrorParser'

interface ErrorContext {
  operation?: string // e.g., 'update', 'create', 'delete'
  resource?: string // e.g., 'product', 'customer', 'subscription'
  id?: string // Resource ID if applicable
  details?: Record<string, any> // Additional context
}

/**
 * Extracts meaningful information from error messages and causes
 */
export function extractErrorDetails(error: unknown): {
  userMessage: string
  developerMessage: string
  code: TRPC_ERROR_CODE_KEY
  context?: Record<string, any>
} {
  // Default response
  let userMessage = 'An unexpected error occurred. Please try again.'
  let developerMessage = 'Unknown error'
  let code: TRPC_ERROR_CODE_KEY = 'INTERNAL_SERVER_ERROR'
  let context: Record<string, any> = {}

  if (error instanceof TRPCError) {
    // Already a TRPC error, just return it with better formatting
    return {
      userMessage: error.message,
      developerMessage: error.message,
      code: error.code,
      context: error.cause as Record<string, any>,
    }
  }

  // Handle NotFoundError with type-safe instanceof check (from @/db/tableUtils)
  if (error instanceof NotFoundError) {
    return {
      userMessage: `The requested ${error.resourceType} could not be found.`,
      developerMessage: error.message,
      code: 'NOT_FOUND',
      context: {
        resource: error.resourceType,
        id: error.resourceId,
        errorType: 'not_found',
      },
    }
  }

  // Handle domain errors from @/errors
  if (error instanceof DomainNotFoundError) {
    return {
      userMessage: `The requested ${error.resource} could not be found.`,
      developerMessage: error.message,
      code: 'NOT_FOUND',
      context: {
        resource: error.resource,
        id: error.id,
        errorType: 'not_found',
      },
    }
  }

  if (error instanceof ValidationError) {
    return {
      userMessage: error.reason,
      developerMessage: error.message,
      code: 'BAD_REQUEST',
      context: {
        field: error.field,
        reason: error.reason,
        errorType: 'validation_error',
      },
    }
  }

  if (error instanceof TerminalStateError) {
    return {
      userMessage: `Cannot perform operation: ${error.resource} is in ${error.state} state.`,
      developerMessage: error.message,
      code: 'BAD_REQUEST',
      context: {
        resource: error.resource,
        id: error.id,
        state: error.state,
        errorType: 'terminal_state_error',
      },
    }
  }

  if (error instanceof ConflictError) {
    return {
      userMessage: error.conflict,
      developerMessage: error.message,
      code: 'CONFLICT',
      context: {
        resource: error.resource,
        conflict: error.conflict,
        errorType: 'conflict_error',
      },
    }
  }

  if (error instanceof AuthorizationError) {
    return {
      userMessage: `Not authorized to ${error.action} ${error.resource}.`,
      developerMessage: error.message,
      code: 'FORBIDDEN',
      context: {
        action: error.action,
        resource: error.resource,
        errorType: 'authorization_error',
      },
    }
  }

  if (error instanceof Error) {
    developerMessage = error.message

    // First, check if this is a PostgreSQL error
    const pgError = extractPostgresError(error)
    if (pgError) {
      const {
        userMessage: pgUserMessage,
        technicalDetails,
        isRetryable,
      } = parsePostgresError(pgError)
      userMessage = pgUserMessage
      context = {
        ...context,
        ...technicalDetails,
        isRetryable,
        errorType: 'postgres_error',
      }

      // Map PostgreSQL error codes to TRPC codes
      if (pgError.code === '23505') {
        code = 'CONFLICT'
      } else if (
        pgError.code === '23503' ||
        pgError.code === '23502' ||
        pgError.code === '23514'
      ) {
        code = 'BAD_REQUEST'
      } else if (pgError.code === '42501') {
        code = 'FORBIDDEN'
      } else if (pgError.code?.startsWith('22')) {
        code = 'BAD_REQUEST'
      } else if (
        pgError.code === '42P01' ||
        pgError.code === '42703'
      ) {
        code = 'NOT_FOUND'
      } else if (
        pgError.code?.startsWith('08') ||
        pgError.code?.startsWith('53')
      ) {
        code = 'INTERNAL_SERVER_ERROR'
      }

      // Return early since we've handled the PostgreSQL error
      return {
        userMessage,
        developerMessage,
        code,
        context,
      }
    }

    // Parse our enhanced database errors (fallback for non-PostgreSQL errors)
    if (error.message.includes('Failed to')) {
      // Extract the operation and resource from our enhanced error messages
      const failedMatch = error.message.match(/Failed to (\w+) (\w+)/)
      if (failedMatch) {
        const [, operation, resource] = failedMatch
        context.operation = operation
        context.resource = resource
      }

      // Check for specific error types
      if (
        error.message.includes('No ') &&
        error.message.includes('found')
      ) {
        // Resource not found
        code = 'NOT_FOUND'
        const idMatch = error.message.match(/id[:\s]+([^\s:]+)/)
        if (idMatch) {
          context.id = idMatch[1]
          userMessage = `The requested ${context.resource || 'item'} could not be found.`
        } else {
          userMessage = 'The requested resource could not be found.'
        }
      } else if (
        error.message.includes('Duplicate key') ||
        error.message.includes('duplicate key')
      ) {
        // Duplicate key constraint - try to parse more details
        code = 'CONFLICT'

        // Try to extract constraint name for better message
        const constraintMatch = error.message.match(
          /constraint[:\s]+"?([^"\s]+)"?/
        )
        if (constraintMatch) {
          context.constraint = constraintMatch[1]
          // Try to get a better message based on constraint name
          if (constraintMatch[1].includes('slug')) {
            userMessage =
              'This slug already exists. Please choose a different one.'
          } else if (constraintMatch[1].includes('email')) {
            userMessage = 'This email address is already in use.'
          } else if (constraintMatch[1].includes('external_id')) {
            userMessage = 'This external ID already exists.'
          } else {
            userMessage =
              'This item already exists. Please use a different identifier.'
          }
        } else {
          userMessage =
            'This item already exists. Please use a different identifier or update the existing item instead.'
        }
        context.errorType = 'duplicate_key'
      } else if (
        error.message.includes('Foreign key constraint') ||
        error.message.includes('violates foreign key')
      ) {
        // Foreign key constraint
        code = 'BAD_REQUEST'
        userMessage =
          'This operation references data that does not exist. Please check your input and try again.'
        context.errorType = 'foreign_key_violation'
      } else if (
        error.message.includes('permission denied') ||
        error.message.includes('not authorized')
      ) {
        // Permission denied
        code = 'FORBIDDEN'
        userMessage =
          'You do not have permission to perform this action.'
        context.errorType = 'permission_denied'
      } else if (
        error.message.includes('Invalid input') ||
        error.message.includes('validation')
      ) {
        // Validation error
        code = 'BAD_REQUEST'

        // Try to extract Zod validation errors
        if (error.cause || error.message.includes('[')) {
          try {
            // Look for JSON array in the error message (Zod errors)
            const jsonMatch = error.message.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              const validationErrors = JSON.parse(jsonMatch[0])
              const fieldErrors = validationErrors
                .map((err: any) => {
                  const field = err.path?.join('.') || 'field'
                  const message = err.message || 'Invalid value'
                  return `${field}: ${message}`
                })
                .join(', ')
              userMessage = `Validation failed: ${fieldErrors}`
              context.validationErrors = validationErrors
            }
          } catch {
            userMessage =
              'Please check your input. Some fields have invalid values.'
          }
        } else {
          userMessage =
            'Please check your input. Some fields have invalid values.'
        }
        context.errorType = 'validation_error'
      } else if (error.message.includes('transaction')) {
        // Transaction error
        code = 'INTERNAL_SERVER_ERROR'
        userMessage =
          'A database error occurred. Please try again or contact support if the problem persists.'
        context.errorType = 'transaction_error'
      } else {
        // Generic database operation failure
        code = 'INTERNAL_SERVER_ERROR'
        const operation = context.operation || 'perform this action'
        userMessage = `Unable to ${operation}. Please try again or contact support if the problem persists.`
      }
    } else if (error.message.includes('Product not found')) {
      code = 'NOT_FOUND'
      userMessage =
        'The product you are trying to update does not exist.'
    } else if (error.message.includes('Customer not found')) {
      code = 'NOT_FOUND'
      userMessage = 'The customer you are looking for does not exist.'
    } else if (error.message.includes('Subscription not found')) {
      code = 'NOT_FOUND'
      userMessage =
        'The subscription you are looking for does not exist.'
    } else if (
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED')
    ) {
      code = 'INTERNAL_SERVER_ERROR'
      userMessage =
        'A network error occurred. Please check your connection and try again.'
      context.errorType = 'network_error'
    }

    // Add cause information if available
    if (error.cause) {
      context.cause =
        error.cause instanceof Error
          ? error.cause.message
          : error.cause
    }
  }

  return {
    userMessage,
    developerMessage,
    code,
    context,
  }
}

/**
 * Wraps a TRPC procedure to handle errors consistently
 */
export function handleTRPCError(
  error: unknown,
  context?: ErrorContext
): never {
  const errorDetails = extractErrorDetails(error)

  // Merge provided context with extracted context
  const fullContext = {
    ...errorDetails.context,
    ...context,
    timestamp: new Date().toISOString(),
    // Include developer message for debugging (remove in production if needed)
    developerMessage: errorDetails.developerMessage,
  }

  // Log the full error details for debugging
  console.error('[TRPC Error Handler]', {
    userMessage: errorDetails.userMessage,
    developerMessage: errorDetails.developerMessage,
    code: errorDetails.code,
    context: fullContext,
    originalError: error,
  })

  throw new TRPCError({
    code: errorDetails.code,
    message: errorDetails.userMessage,
    cause: fullContext,
  })
}

/**
 * Wrapper for async TRPC procedures with automatic error handling
 */
export function withErrorHandling<
  T extends (...args: any[]) => Promise<any>,
>(fn: T, context?: ErrorContext): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      handleTRPCError(error, context)
    }
  }) as T
}

/**
 * Creates a procedure wrapper with pre-configured context
 */
export function createErrorHandler(defaultContext: ErrorContext) {
  return {
    handle: (error: unknown, additionalContext?: ErrorContext) =>
      handleTRPCError(error, {
        ...defaultContext,
        ...additionalContext,
      }),
    wrap: <T extends (...args: any[]) => Promise<any>>(
      fn: T,
      additionalContext?: ErrorContext
    ) =>
      withErrorHandling(fn, {
        ...defaultContext,
        ...additionalContext,
      }),
  }
}

/**
 * Common error handlers for CRUD operations
 */
export const errorHandlers = {
  product: createErrorHandler({ resource: 'product' }),
  customer: createErrorHandler({ resource: 'customer' }),
  subscription: createErrorHandler({ resource: 'subscription' }),
  price: createErrorHandler({ resource: 'price' }),
  pricingModel: createErrorHandler({ resource: 'pricing model' }),
  organization: createErrorHandler({ resource: 'organization' }),
  invoice: createErrorHandler({ resource: 'invoice' }),
  payment: createErrorHandler({ resource: 'payment' }),
  usageMeter: createErrorHandler({ resource: 'usage meter' }),
  generic: createErrorHandler({ resource: 'unknown' }),
}
