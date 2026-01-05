/**
 * Pricing Models utilities.
 *
 * This module provides utilities for creating, reading, diffing, and updating
 * pricing models and their child records (usage meters, features, products, prices).
 */

// Diffing utilities
export {
  computeUpdateObject,
  type DiffResult,
  diffFeatures,
  diffPricingModel,
  diffProducts,
  diffUsageMeters,
  type FeatureDiffInput,
  type PricingModelDiffResult,
  type ProductDiffInput,
  type ProductDiffResult,
  type UsageMeterDiffInput,
} from './diffing'
export { getPricingModelSetupData } from './setupHelpers'
export {
  type SetupPricingModelInput,
  type SetupPricingModelProductInput,
  type SetupPricingModelProductPriceInput,
  validateSetupPricingModelInput,
} from './setupSchemas'
// Setup utilities
export { setupPricingModelTransaction } from './setupTransaction'
export {
  type ResolvedPricingModelIds,
  resolveExistingIds,
  syncProductFeaturesForMultipleProducts,
} from './updateHelpers'
// Update utilities
export {
  type UpdatePricingModelResult,
  updatePricingModelTransaction,
} from './updateTransaction'
