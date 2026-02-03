import { pricingModelsClientUpdateSchema } from '@db-core/schema/pricingModels'
import { z } from 'zod'
import { safeZodSanitizedString } from '@/utils/core'
import { setupPricingModelSchema } from '@/utils/pricingModels/setupSchemas'

/**
 * Extended edit schema that accepts full pricing model structure for CLI sync.
 *
 * This schema mirrors editPricingModelSchema but adds optional structure fields
 * (features, products, usageMeters, resources) derived from setupPricingModelSchema.
 *
 * When only basic fields (name) are provided, the update behaves as before.
 * When structure fields are provided, they enable full pricing model sync via CLI.
 *
 * @see Workstream decision #7 - extend existing update endpoint rather than new sync endpoint
 */
export const editPricingModelWithStructureSchema = z.object({
  id: z.string(),
  pricingModel: pricingModelsClientUpdateSchema.extend({
    name: safeZodSanitizedString.describe(
      'The name of the pricing model'
    ),
    // Optional full structure fields for CLI sync
    features: setupPricingModelSchema.shape.features.optional(),
    products: setupPricingModelSchema.shape.products.optional(),
    usageMeters: setupPricingModelSchema.shape.usageMeters.optional(),
    resources: setupPricingModelSchema.shape.resources.optional(),
  }),
})

export type EditPricingModelWithStructureInput = z.infer<
  typeof editPricingModelWithStructureSchema
>

/**
 * Boolean predicate that returns true when any structure fields are present.
 * Used to determine whether to use simple metadata update or full structure update.
 *
 * Checks `pricingModel.features`, `pricingModel.products`, `pricingModel.usageMeters`,
 * and `pricingModel.resources` for presence (not undefined).
 *
 * Empty array semantics: An empty array (e.g., `features: []`) is treated as present,
 * meaning "clear all items". Only `undefined` means "don't modify this field".
 * This allows callers to intentionally remove all items by passing an empty array.
 */
export const hasStructureFields = (
  input: EditPricingModelWithStructureInput
): boolean => {
  const { pricingModel } = input
  // Truthy check: undefined = no change, [] = clear all, [...items] = replace
  return !!(
    pricingModel.features ||
    pricingModel.products ||
    pricingModel.usageMeters ||
    pricingModel.resources
  )
}
