import { eq, inArray } from 'drizzle-orm'
import {
  type SubscriptionItemFeature,
  subscriptionItemFeatures,
  subscriptionItemFeaturesInsertSchema,
  subscriptionItemFeaturesSelectSchema,
  subscriptionItemFeaturesUpdateSchema,
} from '@/db/schema/subscriptionItemFeatures'
import {
  createBulkUpsertFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { features } from '../schema/features'
import { productFeatures } from '../schema/productFeatures'
import {
  SubscriptionItem,
  subscriptionItems,
} from '../schema/subscriptionItems'
import {
  derivePricingModelIdFromSubscriptionItem,
  derivePricingModelIdsFromSubscriptionItems,
} from './subscriptionItemMethods'

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

const baseInsertSubscriptionItemFeature = createInsertFunction(
  subscriptionItemFeatures,
  config
)

export const insertSubscriptionItemFeature = async (
  subscriptionItemFeatureInsert: SubscriptionItemFeature.Insert,
  transaction: DbTransaction
): Promise<SubscriptionItemFeature.Record> => {
  const pricingModelId =
    subscriptionItemFeatureInsert.pricingModelId ??
    (await derivePricingModelIdFromSubscriptionItem(
      subscriptionItemFeatureInsert.subscriptionItemId,
      transaction
    ))
  return baseInsertSubscriptionItemFeature(
    {
      ...subscriptionItemFeatureInsert,
      pricingModelId,
    },
    transaction
  )
}

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
    .where(whereClause)
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

const baseUpsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId =
  createUpsertFunction(
    subscriptionItemFeatures,
    [
      subscriptionItemFeatures.featureId,
      subscriptionItemFeatures.subscriptionItemId,
    ],
    config
  )

export const upsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId =
  async (
    insert:
      | SubscriptionItemFeature.Insert
      | SubscriptionItemFeature.Insert[],
    transaction: DbTransaction
  ): Promise<SubscriptionItemFeature.Record[]> => {
    const inserts = Array.isArray(insert) ? insert : [insert]

    // Derive pricingModelId for each insert
    // Collect unique subscriptionItemIds that need pricingModelId derivation
    const subscriptionItemIdsNeedingDerivation = Array.from(
      new Set(
        inserts
          .filter((insert) => !insert.pricingModelId)
          .map((insert) => insert.subscriptionItemId)
      )
    )

    // Batch fetch pricingModelIds for all subscription items in one query
    const pricingModelIdMap =
      await derivePricingModelIdsFromSubscriptionItems(
        subscriptionItemIdsNeedingDerivation,
        transaction
      )

    // Derive pricingModelId using the batch-fetched map
    const insertsWithPricingModelId = inserts.map((insert) => {
      const pricingModelId =
        insert.pricingModelId ??
        pricingModelIdMap.get(insert.subscriptionItemId)
      if (!pricingModelId) {
        throw new Error(
          `Could not derive pricingModelId for subscription item ${insert.subscriptionItemId}`
        )
      }
      return {
        ...insert,
        pricingModelId,
      }
    })

    return baseUpsertSubscriptionItemFeatureByProductFeatureIdAndSubscriptionId(
      insertsWithPricingModelId,
      transaction
    )
  }

const baseBulkUpsertSubscriptionItemFeatures =
  createBulkUpsertFunction(subscriptionItemFeatures, config)

export const bulkUpsertSubscriptionItemFeaturesByProductFeatureIdAndSubscriptionId =
  async (
    inserts: SubscriptionItemFeature.Insert[],
    transaction: DbTransaction
  ) => {
    // Collect unique subscriptionItemIds that need pricingModelId derivation
    const subscriptionItemIdsNeedingDerivation = Array.from(
      new Set(
        inserts
          .filter((insert) => !insert.pricingModelId)
          .map((insert) => insert.subscriptionItemId)
      )
    )

    // Batch fetch pricingModelIds for all subscription items in one query
    const pricingModelIdMap =
      await derivePricingModelIdsFromSubscriptionItems(
        subscriptionItemIdsNeedingDerivation,
        transaction
      )

    // Derive pricingModelId using the batch-fetched map
    const insertsWithPricingModelId = inserts.map((insert) => {
      const pricingModelId =
        insert.pricingModelId ??
        pricingModelIdMap.get(insert.subscriptionItemId)
      if (!pricingModelId) {
        throw new Error(
          `Could not derive pricingModelId for subscription item ${insert.subscriptionItemId}`
        )
      }
      return {
        ...insert,
        pricingModelId,
      }
    })

    return baseBulkUpsertSubscriptionItemFeatures(
      insertsWithPricingModelId,
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

export const expireSubscriptionItemFeaturesForSubscriptionItems =
  async (
    subscriptionItemIds: string[],
    expiredAt: Date | number,
    transaction: DbTransaction
  ) => {
    const result = await transaction
      .update(subscriptionItemFeatures)
      .set({
        expiredAt: new Date(expiredAt).getTime(),
      })
      .where(
        inArray(
          subscriptionItemFeatures.subscriptionItemId,
          subscriptionItemIds
        )
      )
      .returning()
    return subscriptionItemFeaturesSelectSchema.array().parse(result)
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

/**
 * Batch select subscription item features by multiple subscription item IDs.
 * This avoids N+1 queries when fetching features for multiple subscription items.
 */
export const selectSubscriptionItemFeaturesBySubscriptionItemIds =
  async (
    subscriptionItemIds: string[],
    transaction: DbTransaction
  ): Promise<SubscriptionItemFeature.Record[]> => {
    if (subscriptionItemIds.length === 0) {
      return []
    }
    const result = await transaction
      .select()
      .from(subscriptionItemFeatures)
      .where(
        inArray(
          subscriptionItemFeatures.subscriptionItemId,
          subscriptionItemIds
        )
      )
    return result.map((row) =>
      subscriptionItemFeaturesSelectSchema.parse(row)
    )
  }
