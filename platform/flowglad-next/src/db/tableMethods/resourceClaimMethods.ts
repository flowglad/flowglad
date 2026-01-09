import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import {
  type ResourceClaim,
  resourceClaims,
  resourceClaimsInsertSchema,
  resourceClaimsSelectSchema,
  resourceClaimsUpdateSchema,
} from '@/db/schema/resourceClaims'
import {
  createBulkInsertFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'

const config: ORMMethodCreatorConfig<
  typeof resourceClaims,
  typeof resourceClaimsSelectSchema,
  typeof resourceClaimsInsertSchema,
  typeof resourceClaimsUpdateSchema
> = {
  selectSchema: resourceClaimsSelectSchema,
  insertSchema: resourceClaimsInsertSchema,
  updateSchema: resourceClaimsUpdateSchema,
  tableName: 'resource_claims',
}

export const selectResourceClaimById = createSelectById(
  resourceClaims,
  config
)

export const insertResourceClaim = createInsertFunction(
  resourceClaims,
  config
)

export const updateResourceClaim = createUpdateFunction(
  resourceClaims,
  config
)

export const selectResourceClaims = createSelectFunction(
  resourceClaims,
  config
)

export const bulkInsertResourceClaims = createBulkInsertFunction(
  resourceClaims,
  config
)

export const selectResourceClaimsPaginated =
  createPaginatedSelectFunction(resourceClaims, config)

/**
 * Selects only active (non-released) resource claims.
 * Active claims are those where releasedAt is null.
 * Uses database-level filtering to leverage the partial index on releasedAt IS NULL.
 */
export const selectActiveResourceClaims = async (
  where: Omit<ResourceClaim.Where, 'releasedAt'>,
  transaction: DbTransaction
): Promise<ResourceClaim.Record[]> => {
  return selectResourceClaims(
    { ...where, releasedAt: null } as ResourceClaim.Where,
    transaction
  )
}

/**
 * Counts active (non-released) claims for a given subscriptionItemFeatureId.
 * Useful for checking capacity against limits.
 * Uses a database COUNT query for efficiency instead of fetching all records.
 */
export const countActiveClaimsForSubscriptionItemFeature = async (
  subscriptionItemFeatureId: string,
  transaction: DbTransaction
): Promise<number> => {
  const result = await transaction
    .select({ count: count() })
    .from(resourceClaims)
    .where(
      and(
        eq(
          resourceClaims.subscriptionItemFeatureId,
          subscriptionItemFeatureId
        ),
        isNull(resourceClaims.releasedAt)
      )
    )
  return result[0]?.count ?? 0
}

/**
 * Releases a resource claim by setting releasedAt timestamp and optional reason.
 */
export const releaseResourceClaim = async (
  params: {
    id: string
    releaseReason?: string | null
  },
  transaction: DbTransaction
): Promise<ResourceClaim.Record> => {
  return updateResourceClaim(
    {
      id: params.id,
      releasedAt: Date.now(),
      releaseReason: params.releaseReason ?? null,
    },
    transaction
  )
}

/**
 * Finds an active claim by externalId for a given resource and subscription.
 * Useful for idempotent claim operations.
 */
export const selectActiveClaimByExternalId = async (
  params: {
    resourceId: string
    subscriptionId: string
    externalId: string
  },
  transaction: DbTransaction
): Promise<ResourceClaim.Record | null> => {
  const claims = await selectActiveResourceClaims(
    {
      resourceId: params.resourceId,
      subscriptionId: params.subscriptionId,
      externalId: params.externalId,
    },
    transaction
  )
  return claims[0] ?? null
}

/**
 * Finds active claims by multiple externalIds for a given resource and subscription.
 * Useful for batch idempotent claim operations.
 */
export const selectActiveClaimsByExternalIds = async (
  params: {
    resourceId: string
    subscriptionId: string
    externalIds: string[]
  },
  transaction: DbTransaction
): Promise<ResourceClaim.Record[]> => {
  if (params.externalIds.length === 0) {
    return []
  }
  const result = await transaction
    .select()
    .from(resourceClaims)
    .where(
      and(
        eq(resourceClaims.resourceId, params.resourceId),
        eq(resourceClaims.subscriptionId, params.subscriptionId),
        inArray(resourceClaims.externalId, params.externalIds),
        isNull(resourceClaims.releasedAt)
      )
    )
  return resourceClaimsSelectSchema.array().parse(result)
}

/**
 * Bulk releases multiple resource claims by their IDs in a single query.
 * Sets releasedAt timestamp and release reason for all claims.
 */
export const bulkReleaseResourceClaims = async (
  claimIds: string[],
  releaseReason: string,
  transaction: DbTransaction
): Promise<ResourceClaim.Record[]> => {
  if (claimIds.length === 0) {
    return []
  }
  const result = await transaction
    .update(resourceClaims)
    .set({
      releasedAt: Date.now(),
      releaseReason,
    })
    .where(
      and(
        inArray(resourceClaims.id, claimIds),
        isNull(resourceClaims.releasedAt)
      )
    )
    .returning()
  return resourceClaimsSelectSchema.array().parse(result)
}
