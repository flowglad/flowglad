import { describe, expect, it } from 'vitest'
import {
  AuthorizationError,
  ConflictError,
  DomainError,
  ExternalServiceError,
  NotFoundError,
  PaymentError,
  RateLimitError,
  TerminalStateError,
  ValidationError,
} from '@/errors'

describe('DomainError', () => {
  it('sets _tag, name, and message from constructor arguments', () => {
    const error = new DomainError('TestTag', 'Test message')
    expect(error._tag).toBe('TestTag')
    expect(error.name).toBe('TestTag')
    expect(error.message).toBe('Test message')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
  })
})

describe('NotFoundError', () => {
  it('constructs with resource and id, sets correct _tag, name, and message format', () => {
    const error = new NotFoundError('User', 'user-123')
    expect(error._tag).toBe('NotFoundError')
    expect(error.name).toBe('NotFoundError')
    expect(error.message).toBe('User not found: user-123')
    expect(error.resource).toBe('User')
    expect(error.id).toBe('user-123')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(NotFoundError)
  })
})

describe('ValidationError', () => {
  it('constructs with field and reason, sets correct _tag, name, and message format', () => {
    const error = new ValidationError(
      'email',
      'must be a valid email address'
    )
    expect(error._tag).toBe('ValidationError')
    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe(
      'Invalid email: must be a valid email address'
    )
    expect(error.field).toBe('email')
    expect(error.reason).toBe('must be a valid email address')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(ValidationError)
  })
})

describe('ConflictError', () => {
  it('constructs with resource and conflict, sets correct _tag, name, and message format', () => {
    const error = new ConflictError('Subscription', 'already active')
    expect(error._tag).toBe('ConflictError')
    expect(error.name).toBe('ConflictError')
    expect(error.message).toBe(
      'Subscription conflict: already active'
    )
    expect(error.resource).toBe('Subscription')
    expect(error.conflict).toBe('already active')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(ConflictError)
  })
})

describe('TerminalStateError', () => {
  it('constructs with resource, id, and state, sets correct _tag, name, and message format', () => {
    const error = new TerminalStateError('Invoice', 'inv-456', 'paid')
    expect(error._tag).toBe('TerminalStateError')
    expect(error.name).toBe('TerminalStateError')
    expect(error.message).toBe(
      'Invoice inv-456 is in terminal state: paid'
    )
    expect(error.resource).toBe('Invoice')
    expect(error.id).toBe('inv-456')
    expect(error.state).toBe('paid')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(TerminalStateError)
  })
})

describe('PaymentError', () => {
  it('constructs with reason only, sets correct _tag, name, and uses reason as message', () => {
    const error = new PaymentError('Card declined')
    expect(error._tag).toBe('PaymentError')
    expect(error.name).toBe('PaymentError')
    expect(error.message).toBe('Card declined')
    expect(error.reason).toBe('Card declined')
    expect(error.paymentId).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(PaymentError)
  })

  it('constructs with reason and paymentId, sets correct _tag, name, message, and stores paymentId', () => {
    const error = new PaymentError('Insufficient funds', 'pay-789')
    expect(error._tag).toBe('PaymentError')
    expect(error.name).toBe('PaymentError')
    expect(error.message).toBe('Insufficient funds')
    expect(error.reason).toBe('Insufficient funds')
    expect(error.paymentId).toBe('pay-789')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(PaymentError)
  })
})

describe('AuthorizationError', () => {
  it('constructs with action and resource, sets correct _tag, name, and message format', () => {
    const error = new AuthorizationError('delete', 'Organization')
    expect(error._tag).toBe('AuthorizationError')
    expect(error.name).toBe('AuthorizationError')
    expect(error.message).toBe(
      'Not authorized to delete Organization'
    )
    expect(error.action).toBe('delete')
    expect(error.resource).toBe('Organization')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(AuthorizationError)
  })
})

describe('RateLimitError', () => {
  it('constructs with resource and limit, sets correct _tag, name, and message format', () => {
    const error = new RateLimitError(
      'API calls',
      'exceeded 100 requests per minute'
    )
    expect(error._tag).toBe('RateLimitError')
    expect(error.name).toBe('RateLimitError')
    expect(error.message).toBe(
      'Rate limit exceeded for API calls: exceeded 100 requests per minute'
    )
    expect(error.resource).toBe('API calls')
    expect(error.limit).toBe('exceeded 100 requests per minute')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(RateLimitError)
  })
})

describe('ExternalServiceError', () => {
  it('constructs with service and operation only, sets correct _tag, name, and message format without reason', () => {
    const error = new ExternalServiceError(
      'Stripe',
      'create payment intent'
    )
    expect(error._tag).toBe('ExternalServiceError')
    expect(error.name).toBe('ExternalServiceError')
    expect(error.message).toBe('Stripe create payment intent failed')
    expect(error.service).toBe('Stripe')
    expect(error.operation).toBe('create payment intent')
    expect(error.reason).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(ExternalServiceError)
  })

  it('constructs with service, operation, and reason, sets correct _tag, name, and message format with reason', () => {
    const error = new ExternalServiceError(
      'Stripe',
      'create payment intent',
      'connection timeout'
    )
    expect(error._tag).toBe('ExternalServiceError')
    expect(error.name).toBe('ExternalServiceError')
    expect(error.message).toBe(
      'Stripe create payment intent failed: connection timeout'
    )
    expect(error.service).toBe('Stripe')
    expect(error.operation).toBe('create payment intent')
    expect(error.reason).toBe('connection timeout')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(ExternalServiceError)
  })
})
