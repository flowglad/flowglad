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
  coreSubscriptionFeaturesUpdateSchema,
  SubscriptionFeature, // Used for deactivate
} from '@/db/schema/subscriptionFeatures'
import { DbTransaction } from '@/db/types'

const config: ORMMethodCreatorConfig<
  typeof subscriptionFeatures,
  typeof subscriptionFeaturesSelectSchema,
  typeof subscriptionFeaturesInsertSchema,
  typeof subscriptionFeaturesUpdateSchema
> = {
  tableName: 'subscription_features',
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
  subscriptionFeature: SubscriptionFeature.Record,
  deactivatedAt: Date,
  transaction: DbTransaction
) => {
  return updateSubscriptionFeature(
    {
      ...subscriptionFeature,
      deactivatedAt,
    },
    transaction
  )
}
