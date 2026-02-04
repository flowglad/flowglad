import { pricingModelsClientUpdateSchema } from '@db-core/schema/pricingModels'
import { z } from 'zod'
import { safeZodSanitizedString } from '@/utils/core'
import { setupPricingModelSchema } from '@/utils/pricingModels/setupSchemas'

/**
 * Pricing model inner schema with optional structure fields for CLI sync.
 *
 * Supports two update modes:
 * 1. **Metadata-only update**: Only provide `name` and/or `isDefault` fields.
 *    Structure fields (features, products, usageMeters, resources) must be omitted.
 * 2. **Full structure update**: Provide ALL structure fields together.
 *    This is a full replacement - partial structure updates are not allowed.
 *
 * The all-or-nothing constraint prevents accidental data loss from partial updates.
 */
const pricingModelWithStructureFieldsSchema =
  pricingModelsClientUpdateSchema
    .extend({
      name: safeZodSanitizedString.describe(
        'The name of the pricing model'
      ),
      // Optional full structure fields for CLI sync - all or nothing
      features: setupPricingModelSchema.shape.features.optional(),
      products: setupPricingModelSchema.shape.products.optional(),
      usageMeters:
        setupPricingModelSchema.shape.usageMeters.optional(),
      resources: setupPricingModelSchema.shape.resources.optional(),
    })
    .superRefine((data, ctx) => {
      const structureFieldNames = [
        'features',
        'products',
        'usageMeters',
        'resources',
      ] as const
      const structureFields = [
        data.features,
        data.products,
        data.usageMeters,
        data.resources,
      ]
      const hasAny = structureFields.some((f) => f !== undefined)
      const hasAll = structureFields.every((f) => f !== undefined)

      // Either no structure fields (metadata-only) or all structure fields (full replacement)
      if (hasAny && !hasAll) {
        const missingFields = structureFieldNames.filter(
          (name) => data[name] === undefined
        )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Full structure update requires all structure fields to be provided. Missing: ${missingFields.join(', ')}. For metadata-only updates, omit all structure fields.`,
        })
      }
    })

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
  pricingModel: pricingModelWithStructureFieldsSchema,
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

/**
 * Type predicate that returns true when all structure fields are present.
 * When this returns true, TypeScript narrows the input type to guarantee
 * all structure fields are defined (not undefined).
 *
 * Use this instead of hasStructureFields when you need type narrowing
 * to avoid non-null assertions on the structure fields.
 */
export const hasAllStructureFields = (
  input: EditPricingModelWithStructureInput
): input is EditPricingModelWithStructureInput & {
  pricingModel: EditPricingModelWithStructureInput['pricingModel'] & {
    features: NonNullable<
      EditPricingModelWithStructureInput['pricingModel']['features']
    >
    products: NonNullable<
      EditPricingModelWithStructureInput['pricingModel']['products']
    >
    usageMeters: NonNullable<
      EditPricingModelWithStructureInput['pricingModel']['usageMeters']
    >
    resources: NonNullable<
      EditPricingModelWithStructureInput['pricingModel']['resources']
    >
  }
} => {
  const { pricingModel } = input
  return (
    pricingModel.features !== undefined &&
    pricingModel.products !== undefined &&
    pricingModel.usageMeters !== undefined &&
    pricingModel.resources !== undefined
  )
}
