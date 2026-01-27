import { TRPCError } from '@trpc/server'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  TerminalStateError,
  ValidationError,
} from '@/errors'

export function toTRPCError(error: Error): TRPCError {
  if (error instanceof NotFoundError) {
    return new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    })
  }
  if (error instanceof ValidationError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    })
  }
  if (error instanceof TerminalStateError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    })
  }
  if (error instanceof ConflictError) {
    return new TRPCError({ code: 'CONFLICT', message: error.message })
  }
  if (error instanceof AuthorizationError) {
    return new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    })
  }
  // Default for unknown errors
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error.message,
  })
}
