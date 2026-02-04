import {
  type Price,
  priceImmutableFields,
} from '@db-core/schema/prices'
import { Result } from 'better-result'
import { ValidationError } from '@/errors'

/**
 * Validates that immutable price fields are not being changed after creation.
 * Returns Result.ok(undefined) if valid, Result.err(ValidationError) if invalid.
 */
export const validatePriceImmutableFields = ({
  update,
  existing,
}: {
  update: Partial<Price.Update>
  existing: Price.Record
}): Result<void, ValidationError> => {
  // disallow update of discriminator
  // need to include type in permissible fields passed
  // in order for discriminated union on update schemas to work correctly
  if (update.type !== undefined && update.type !== existing.type) {
    return Result.err(
      new ValidationError(
        'type',
        'Cannot change type after price creation. This field is immutable.'
      )
    )
  }
  // These fields should never change after creation
  for (const field of priceImmutableFields) {
    if (
      field in update &&
      update[field as keyof Price.Update] !== undefined &&
      update[field as keyof Price.Update] !==
        existing[field as keyof Price.Record]
    ) {
      return Result.err(
        new ValidationError(
          field,
          `Cannot change ${field} after price creation. This field is immutable.`
        )
      )
    }
  }
  return Result.ok(undefined)
}
