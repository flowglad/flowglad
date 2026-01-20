// Base tagged error class
export class DomainError extends Error {
  readonly _tag: string
  constructor(tag: string, message: string) {
    super(message)
    this._tag = tag
    this.name = tag
  }
}

export class NotFoundError extends DomainError {
  constructor(
    public readonly resource: string,
    public readonly id: string
  ) {
    super('NotFoundError', `${resource} not found: ${id}`)
  }
}

export class ValidationError extends DomainError {
  constructor(
    public readonly field: string,
    public readonly reason: string
  ) {
    super('ValidationError', `Invalid ${field}: ${reason}`)
  }
}

export class ConflictError extends DomainError {
  constructor(
    public readonly resource: string,
    public readonly conflict: string
  ) {
    super('ConflictError', `${resource} conflict: ${conflict}`)
  }
}

export class TerminalStateError extends DomainError {
  constructor(
    public readonly resource: string,
    public readonly id: string,
    public readonly state: string
  ) {
    super(
      'TerminalStateError',
      `${resource} ${id} is in terminal state: ${state}`
    )
  }
}

export class PaymentError extends DomainError {
  constructor(
    public readonly reason: string,
    public readonly paymentId?: string
  ) {
    super('PaymentError', reason)
  }
}

export class AuthorizationError extends DomainError {
  constructor(
    public readonly action: string,
    public readonly resource: string
  ) {
    super(
      'AuthorizationError',
      `Not authorized to ${action} ${resource}`
    )
  }
}

export class RateLimitError extends DomainError {
  constructor(
    public readonly resource: string,
    public readonly limit: string
  ) {
    super(
      'RateLimitError',
      `Rate limit exceeded for ${resource}: ${limit}`
    )
  }
}

export class ExternalServiceError extends DomainError {
  constructor(
    public readonly service: string,
    public readonly operation: string,
    public readonly reason?: string
  ) {
    super(
      'ExternalServiceError',
      `${service} ${operation} failed${reason ? `: ${reason}` : ''}`
    )
  }
}
