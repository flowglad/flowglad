import { TRPCError } from '@trpc/server'
import {
  selectDefaultPricingModel,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import type { DbTransaction } from '@/db/types'

/**
 * Validates that a pricingModelId belongs to the specified organization and livemode.
 * Returns the validated pricingModelId or the default pricing model's ID if not provided.
 *
 * @throws TRPCError if the pricingModelId is invalid or no default pricing model exists
 */
export const validateAndResolvePricingModelId = async ({
  pricingModelId,
  organizationId,
  livemode,
  transaction,
}: {
  pricingModelId: string | undefined | null
  organizationId: string
  livemode: boolean
  transaction: DbTransaction
}): Promise<string> => {
  if (pricingModelId) {
    // Validate that the provided pricingModelId belongs to this organization and livemode
    const [validPricingModel] = await selectPricingModels(
      {
        id: pricingModelId,
        organizationId,
        livemode,
      },
      transaction
    )
    if (!validPricingModel) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Invalid pricing model: the specified pricing model does not exist or does not belong to this organization',
      })
    }
    return pricingModelId
  }

  // No pricingModelId provided, use the default
  const defaultPM = await selectDefaultPricingModel(
    { organizationId, livemode },
    transaction
  )
  if (!defaultPM) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No default pricing model found for organization',
    })
  }
  return defaultPM.id
}
