import { Price, priceImmutableFields } from '@/db/schema/prices'
import { TRPCError } from '@trpc/server'

/**
 * Validates that immutable price fields are not being changed after creation
 */
export const validatePriceImmutableFields = ({
  update,
  existing,
}: {
  update: Partial<Price.Update>
  existing: Price.Record
}): void => {
  // These fields should never change after creation
  for (const field of priceImmutableFields) {
    if (
      field in update &&
      update[field as keyof Price.Update] !== undefined &&
      update[field as keyof Price.Update] !==
        existing[field as keyof Price.Record]
    ) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Cannot change ${field} after price creation. This field is immutable.`,
      })
    }
  }
}
