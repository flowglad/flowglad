import { pricingModelsClientUpdateSchema } from '@db-core/schema/pricingModels'
import { z } from 'zod'
import { setupPricingModelSchema } from '@/utils/pricingModels/setupSchemas'

/**
 * Extended edit schema that accepts full pricing model structure for CLI sync.
 *
 * This schema extends the base editPricingModelSchema with optional structure
 * fields (features, products, usageMeters, resources) from setupPricingModelSchema.
 *
 * When only basic fields (name) are provided, the update behaves as before.
 * When structure fields are provided, they enable full pricing model sync via CLI.
 *
 * @see Workstream decision #7 - extend existing update endpoint rather than new sync endpoint
 */
export const editPricingModelWithStructureSchema = z.object({
  id: z.string(),
  pricingModel: pricingModelsClientUpdateSchema.extend({
    name: z.string().min(1, 'Name is required'),
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
 * Type guard to check if the input contains structure fields.
 * Used to determine whether to use simple metadata update or full structure update.
 */
export const hasStructureFields = (
  input: EditPricingModelWithStructureInput
): boolean => {
  const { pricingModel } = input
  return !!(
    pricingModel.features ||
    pricingModel.products ||
    pricingModel.usageMeters ||
    pricingModel.resources
  )
}
