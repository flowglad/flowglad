import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
  createBulkUpsertFunction,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  subscriptionItemFeatures,
  subscriptionItemFeaturesInsertSchema,
  subscriptionItemFeaturesSelectSchema,
  subscriptionItemFeaturesUpdateSchema,
  SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import { DbTransaction } from '@/db/types'
import {
  SubscriptionItem,
  subscriptionItems,
} from '../schema/subscriptionItems'
import { and, eq, inArray } from 'drizzle-orm'
import { productFeatures } from '../schema/productFeatures'
import { features } from '../schema/features'

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

export const selectClientSubscriptionItemFeatureAndFeatureById =
  async (id: string, transaction: DbTransaction) => {
    const result = await transaction
      .select({
        subscriptionItemFeature: subscriptionItemFeatures,
        feature: {
          name: features.name,
          slug: features.slug,
        },
      })
      .from(subscriptionItemFeatures)
      .innerJoin(
        features,
        eq(subscriptionItemFeatures.featureId, features.id)
      )
      .where(eq(subscriptionItemFeatures.id, id))
    return result.map((row) => {
      return {
        ...subscriptionItemFeaturesSelectSchema.parse(
          row.subscriptionItemFeature
        ),
        name: row.feature.name,
        slug: row.feature.slug,
      }
    })
  }

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

export const selectSubscriptionItemFeaturesWithFeatureSlug = async (
  where: SubscriptionItemFeature.Where,
  transaction: DbTransaction
): Promise<SubscriptionItemFeature.ClientRecord[]> => {
  const whereClause = whereClauseFromObject(
    subscriptionItemFeatures,
    where
  )
  const result = await transaction
    .select({
      subscriptionItemFeature: subscriptionItemFeatures,
      feature: {
        name: features.name,
        slug: features.slug,
      },
    })
    .from(subscriptionItemFeatures)
    .innerJoin(
      features,
      eq(subscriptionItemFeatures.featureId, features.id)
    )
    .where(and(whereClause, eq(features.active, true)))
  return result.map((row) => {
    const subscriptionItemFeature =
      subscriptionItemFeaturesSelectSchema.parse(
        row.subscriptionItemFeature
      )
    return {
      ...subscriptionItemFeature,
      name: row.feature.name,
      slug: row.feature.slug,
    }
  })
}

export const upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId =
  createUpsertFunction(
    subscriptionItemFeatures,
    [
      subscriptionItemFeatures.featureId,
      subscriptionItemFeatures.subscriptionItemId,
    ],
    config
  )

const bulkUpsertSubscriptionItemFeatures = createBulkUpsertFunction(
  subscriptionItemFeatures,
  config
)

export const bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId =
  async (
    inserts: SubscriptionItemFeature.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkUpsertSubscriptionItemFeatures(
      inserts,
      [
        subscriptionItemFeatures.featureId,
        subscriptionItemFeatures.subscriptionItemId,
      ],
      transaction
    )
  }

export const expireSubscriptionItemFeature = async (
  subscriptionItemFeature: SubscriptionItemFeature.Record,
  expiredAt: Date | number,
  transaction: DbTransaction
) => {
  return updateSubscriptionItemFeature(
    {
      ...subscriptionItemFeature,
      expiredAt: new Date(expiredAt).getTime(),
    },
    transaction
  )
}

export const expireSubscriptionItemFeaturesForSubscriptionItem =
  async (
    subscriptionItemId: string,
    expiredAt: Date | number,
    transaction: DbTransaction
  ) => {
    const result = await transaction
      .update(subscriptionItemFeatures)
      .set({
        expiredAt: new Date(expiredAt).getTime(),
      })
      .where(
        eq(
          subscriptionItemFeatures.subscriptionItemId,
          subscriptionItemId
        )
      )
      .returning()
    return result.map((row) =>
      subscriptionItemFeaturesSelectSchema.parse(row)
    )
  }

/**
 * Detaches all subscription item features from a specific product feature.
 * This is used when a product feature is being expired/deleted to preserve
 * existing customer subscription item features while breaking the association.
 */
export const detachSubscriptionItemFeaturesFromProductFeature =
  async (
    params: {
      productFeatureIds: string[]
      detachedReason: string
    },
    transaction: DbTransaction
  ): Promise<SubscriptionItemFeature.Record[]> => {
    const { productFeatureIds, detachedReason } = params
    const detachedAt = new Date()
    const result = await transaction
      .update(subscriptionItemFeatures)
      .set({
        productFeatureId: null,
        detachedAt: new Date(detachedAt).getTime(),
        detachedReason,
      })
      .where(
        inArray(
          subscriptionItemFeatures.productFeatureId,
          productFeatureIds
        )
      )
      .returning()

    return result.map((row) =>
      subscriptionItemFeaturesSelectSchema.parse(row)
    )
  }
