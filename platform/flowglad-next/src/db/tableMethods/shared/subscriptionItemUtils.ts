/**
 * Client-safe utility functions for subscription items.
 *
 * IMPORTANT: This file must NOT import any server-only modules (e.g., cache-recomputable.ts,
 * database clients, server-only packages). It's designed to be importable by both
 * client and server code without causing bundler issues.
 *
 * If you need to add server-only functionality, add it to the main
 * subscriptionItemMethods.ts file instead.
 */

import {
  subscriptionItems,
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemsUpdateSchema,
} from '@/db/schema/subscriptionItems'
import {
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createSelectById,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'

const config: ORMMethodCreatorConfig<
  typeof subscriptionItems,
  typeof subscriptionItemsSelectSchema,
  typeof subscriptionItemsInsertSchema,
  typeof subscriptionItemsUpdateSchema
> = {
  selectSchema: subscriptionItemsSelectSchema,
  insertSchema: subscriptionItemsInsertSchema,
  updateSchema: subscriptionItemsUpdateSchema,
  tableName: 'subscription_items',
}

export const selectSubscriptionItemById = createSelectById(
  subscriptionItems,
  config
)

/**
 * Derives pricingModelId from a subscription item.
 * Used for subscription item inserts.
 */
export const derivePricingModelIdFromSubscriptionItem =
  createDerivePricingModelId(
    subscriptionItems,
    config,
    selectSubscriptionItemById
  )

/**
 * Batch derives pricingModelIds from multiple subscription items.
 * More efficient than calling derivePricingModelIdFromSubscriptionItem individually.
 */
export const derivePricingModelIdsFromSubscriptionItems =
  createDerivePricingModelIds(subscriptionItems, config)
