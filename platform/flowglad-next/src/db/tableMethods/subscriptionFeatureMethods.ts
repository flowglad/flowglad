import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  subscriptionFeatures,
  subscriptionFeaturesInsertSchema,
  subscriptionFeaturesSelectSchema,
  subscriptionFeaturesUpdateSchema,
  coreSubscriptionFeaturesUpdateSchema, // Used for deactivate
} from '@/db/schema/subscriptionFeatures'
import { DBTransaction } from '@/db'

const config: ORMMethodCreatorConfig<
  typeof subscriptionFeatures,
  typeof subscriptionFeaturesSelectSchema,
  typeof subscriptionFeaturesInsertSchema,
  typeof subscriptionFeaturesUpdateSchema
> = {
  selectSchema: subscriptionFeaturesSelectSchema,
  insertSchema: subscriptionFeaturesInsertSchema,
  updateSchema: subscriptionFeaturesUpdateSchema,
}

export const selectSubscriptionFeatureById = createSelectById(
  subscriptionFeatures,
  config
)

export const insertSubscriptionFeature = createInsertFunction(
  subscriptionFeatures,
  config
)

export const updateSubscriptionFeature = createUpdateFunction(
  subscriptionFeatures,
  config
)

export const selectSubscriptionFeatures = createSelectFunction(
  subscriptionFeatures,
  config
)

export const upsertSubscriptionFeatureByProductFeatureIdAndSubscriptionId =
  createUpsertFunction(
    subscriptionFeatures,
    [
      subscriptionFeatures.productFeatureId,
      subscriptionFeatures.subscriptionId,
    ],
    config
  )

export const deactivateSubscriptionFeature = async (
  id: string,
  deactivatedAt: Date,
  transaction: DBTransaction
) => {
  // We use coreSubscriptionFeaturesUpdateSchema here because we are only updating a single field
  // and don't need the complexity of the discriminated union for this specific operation.
  // The discriminated union update schema would require the 'type' field.
  const updateData = coreSubscriptionFeaturesUpdateSchema.parse({
    id,
    deactivatedAt,
  })
  return createUpdateFunction(subscriptionFeatures, {
    selectSchema: subscriptionFeaturesSelectSchema,
    insertSchema: subscriptionFeaturesInsertSchema,
    updateSchema: coreSubscriptionFeaturesUpdateSchema, // Use core schema for this specific update
  })(updateData, transaction)
}
