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

export class SubscriptionTerminalStateError extends DomainError {
  constructor(
    public readonly subscriptionId: string,
    public readonly state: string
  ) {
    super(
      'SubscriptionTerminalStateError',
      `Cannot mutate subscription ${subscriptionId} in terminal state: ${state}`
    )
  }
}

export class ArchivedCustomerError extends DomainError {
  constructor(public readonly operation: string) {
    super(
      'ArchivedCustomerError',
      `Cannot ${operation} for archived customer`
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

// Membership-related errors

export class CannotRemoveOwnerError extends DomainError {
  constructor() {
    super(
      'CannotRemoveOwnerError',
      'Cannot remove the owner of an organization'
    )
  }
}

export class MembershipNotFoundError extends DomainError {
  constructor(public readonly membershipId: string) {
    super(
      'MembershipNotFoundError',
      `Membership not found: ${membershipId}`
    )
  }
}

export class MembershipAlreadyDeactivatedError extends DomainError {
  constructor(public readonly membershipId: string) {
    super(
      'MembershipAlreadyDeactivatedError',
      `Membership is already deactivated: ${membershipId}`
    )
  }
}

/**
 * Panic is used for invariant violations - code defects that indicate bugs.
 * Unlike Result.err(), panic throws immediately and should never be caught.
 * Use this when a code path should be unreachable or when encountering
 * a state that indicates a bug in the code.
 *
 * @param message - Description of the invariant violation
 * @throws Error - Always throws, never returns
 */
export function panic(message: string): never {
  throw new Error(message)
}
