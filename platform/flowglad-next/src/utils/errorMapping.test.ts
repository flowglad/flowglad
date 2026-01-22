import { describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  PaymentError,
  TerminalStateError,
  ValidationError,
} from '@/errors'
import { toTRPCError } from '@/utils/errorMapping'

describe('toTRPCError', () => {
  it('maps NotFoundError to NOT_FOUND TRPCError with original message', () => {
    const domainError = new NotFoundError('User', 'user-123')
    const trpcError = toTRPCError(domainError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('NOT_FOUND')
    expect(trpcError.message).toBe('User not found: user-123')
  })

  it('maps ValidationError to BAD_REQUEST TRPCError with original message', () => {
    const domainError = new ValidationError('email', 'must be valid')
    const trpcError = toTRPCError(domainError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('BAD_REQUEST')
    expect(trpcError.message).toBe('Invalid email: must be valid')
  })

  it('maps ConflictError to CONFLICT TRPCError with original message', () => {
    const domainError = new ConflictError(
      'Subscription',
      'already exists'
    )
    const trpcError = toTRPCError(domainError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('CONFLICT')
    expect(trpcError.message).toBe(
      'Subscription conflict: already exists'
    )
  })

  it('maps AuthorizationError to FORBIDDEN TRPCError with original message', () => {
    const domainError = new AuthorizationError('update', 'Invoice')
    const trpcError = toTRPCError(domainError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('FORBIDDEN')
    expect(trpcError.message).toBe('Not authorized to update Invoice')
  })

  it('maps PaymentError to INTERNAL_SERVER_ERROR TRPCError with original message', () => {
    const domainError = new PaymentError('Card declined', 'pay-123')
    const trpcError = toTRPCError(domainError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR')
    expect(trpcError.message).toBe('Card declined')
  })

  it('maps TerminalStateError to INTERNAL_SERVER_ERROR TRPCError with original message', () => {
    const domainError = new TerminalStateError(
      'Invoice',
      'inv-456',
      'paid'
    )
    const trpcError = toTRPCError(domainError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR')
    expect(trpcError.message).toBe(
      'Invoice inv-456 is in terminal state: paid'
    )
  })

  it('maps generic Error to INTERNAL_SERVER_ERROR TRPCError with original message', () => {
    const genericError = new Error('Something went wrong')
    const trpcError = toTRPCError(genericError)
    expect(trpcError).toBeInstanceOf(TRPCError)
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR')
    expect(trpcError.message).toBe('Something went wrong')
  })
})
