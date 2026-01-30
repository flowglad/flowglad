import type { Membership } from '@db-core/schema/memberships'
import type { PricingModel } from '@db-core/schema/pricingModels'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import {
  selectFocusedMembershipAndOrganization,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import type { DbTransaction } from '@/db/types'

interface UpdateFocusedPricingModelInput {
  pricingModelId: string
  userId: string
  organizationId: string
}

interface UpdateFocusedPricingModelResult {
  membership: Membership.Record
  pricingModel: PricingModel.Record
}

/**
 * Transaction function for updating a user's focused pricing model.
 *
 * This function:
 * 1. Validates the pricing model exists and belongs to the user's current organization
 * 2. Gets the user's focused membership and validates org match
 * 3. Updates membership.focusedPricingModelId AND auto-syncs livemode to match PM's livemode
 *
 * @param input - Contains pricingModelId, userId, and organizationId
 * @param transaction - Database transaction
 * @returns Result containing updated membership and pricing model, or TRPCError
 */
export const updateFocusedPricingModelTransaction = async (
  input: UpdateFocusedPricingModelInput,
  transaction: DbTransaction
): Promise<Result<UpdateFocusedPricingModelResult, TRPCError>> => {
  // 1. Validate PM exists and belongs to current org
  const pricingModelResult = await selectPricingModelById(
    input.pricingModelId,
    transaction
  )
  if (Result.isError(pricingModelResult)) {
    return Result.err(
      new TRPCError({
        code: 'NOT_FOUND',
        message: 'Pricing model not found',
      })
    )
  }
  const pricingModel = pricingModelResult.value
  if (pricingModel.organizationId !== input.organizationId) {
    return Result.err(
      new TRPCError({
        code: 'FORBIDDEN',
        message: 'Pricing model does not belong to this organization',
      })
    )
  }

  // 2. Get focused membership and validate org match
  const focusedMembership =
    await selectFocusedMembershipAndOrganization(
      input.userId,
      transaction
    )
  if (!focusedMembership) {
    return Result.err(
      new TRPCError({
        code: 'NOT_FOUND',
        message: 'No focused membership found for user',
      })
    )
  }
  if (
    focusedMembership.membership.organizationId !==
    input.organizationId
  ) {
    return Result.err(
      new TRPCError({
        code: 'FORBIDDEN',
        message:
          'Focused membership does not match the requested organization',
      })
    )
  }

  // 3. Update membership.focusedPricingModelId AND auto-sync livemode
  const updatedMembership = await updateMembership(
    {
      id: focusedMembership.membership.id,
      focusedPricingModelId: input.pricingModelId,
      livemode: pricingModel.livemode, // Auto-sync to match PM's livemode
    },
    transaction
  )

  return Result.ok({ membership: updatedMembership, pricingModel })
}
