import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  subscriptionItemFeatures,
  subscriptionItemFeaturesInsertSchema,
  subscriptionItemFeaturesSelectSchema,
  subscriptionItemFeaturesUpdateSchema,
  SubscriptionItemFeature, // Used for deactivate
} from '@/db/schema/subscriptionItemFeatures'
import { DbTransaction } from '@/db/types'

const config: ORMMethodCreatorConfig<
  typeof subscriptionItemFeatures,
  typeof subscriptionItemFeaturesSelectSchema,
  typeof subscriptionItemFeaturesInsertSchema,
  typeof subscriptionItemFeaturesUpdateSchema
> = {
  tableName: 'subscription_features',
  selectSchema: subscriptionItemFeaturesSelectSchema,
  insertSchema: subscriptionItemFeaturesInsertSchema,
  updateSchema: subscriptionItemFeaturesUpdateSchema,
}

export const selectSubscriptionItemFeatureById = createSelectById(
  subscriptionItemFeatures,
  config
)

export const insertSubscriptionItemFeature = createInsertFunction(
  subscriptionItemFeatures,
  config
)

export const updateSubscriptionItemFeature = createUpdateFunction(
  subscriptionItemFeatures,
  config
)

export const selectSubscriptionItemFeatures = createSelectFunction(
  subscriptionItemFeatures,
  config
)

export const upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId =
  createUpsertFunction(
    subscriptionItemFeatures,
    [
      subscriptionItemFeatures.productFeatureId,
      subscriptionItemFeatures.subscriptionItemId,
    ],
    config
  )

export const expireSubscriptionItemFeature = async (
  subscriptionItemFeature: SubscriptionItemFeature.Record,
  expiredAt: Date,
  transaction: DbTransaction
) => {
  return updateSubscriptionItemFeature(
    {
      ...subscriptionItemFeature,
      expiredAt,
    },
    transaction
  )
}
