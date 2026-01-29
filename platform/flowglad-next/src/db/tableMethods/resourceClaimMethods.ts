import {
  createBulkInsertFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import {
  type ResourceClaim,
  resourceClaims,
  resourceClaimsInsertSchema,
  resourceClaimsSelectSchema,
  resourceClaimsUpdateSchema,
} from '@/db/schema/resourceClaims'
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
 * Selects only active (non-released, non-expired) resource claims.
 * Active claims are those where:
 * - releasedAt IS NULL (not released)
 * - AND (expiredAt IS NULL OR expiredAt > NOW()) (not expired)
 *
 * Uses database-level filtering to leverage the partial index on releasedAt IS NULL.
 *
 * Supports both single values and arrays for subscriptionId, resourceId, and id fields.
 */
export const selectActiveResourceClaims = async (
  where: {
    subscriptionId?: string | string[]
    resourceId?: string | string[]
    externalId?: string | null
    organizationId?: string
    pricingModelId?: string
    id?: string | string[]
  },
  transaction: DbTransaction
): Promise<ResourceClaim.Record[]> => {
  const now = Date.now()

  // Build conditions array
  const conditions = [
    isNull(resourceClaims.releasedAt),
    or(
      isNull(resourceClaims.expiredAt),
      gt(resourceClaims.expiredAt, now)
    ),
  ]

  // Add optional where conditions - handle both single values and arrays
  if (where.subscriptionId !== undefined) {
    if (Array.isArray(where.subscriptionId)) {
      conditions.push(
        inArray(resourceClaims.subscriptionId, where.subscriptionId)
      )
    } else {
      conditions.push(
        eq(resourceClaims.subscriptionId, where.subscriptionId)
      )
    }
  }
  if (where.resourceId !== undefined) {
    if (Array.isArray(where.resourceId)) {
      conditions.push(
        inArray(resourceClaims.resourceId, where.resourceId)
      )
    } else {
      conditions.push(eq(resourceClaims.resourceId, where.resourceId))
    }
  }
  if (where.externalId !== undefined) {
    if (where.externalId === null) {
      conditions.push(isNull(resourceClaims.externalId))
    } else {
      conditions.push(eq(resourceClaims.externalId, where.externalId))
    }
  }
  if (where.organizationId !== undefined) {
    conditions.push(
      eq(resourceClaims.organizationId, where.organizationId)
    )
  }
  if (where.pricingModelId !== undefined) {
    conditions.push(
      eq(resourceClaims.pricingModelId, where.pricingModelId)
    )
  }
  if (where.id !== undefined) {
    if (Array.isArray(where.id)) {
      conditions.push(inArray(resourceClaims.id, where.id))
    } else {
      conditions.push(eq(resourceClaims.id, where.id))
    }
  }

  const result = await transaction
    .select()
    .from(resourceClaims)
    .where(and(...conditions))

  return resourceClaimsSelectSchema.array().parse(result)
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
 * Counts active (non-released, non-expired) claims for a given subscription and resource.
 * Active claims are those where:
 * - releasedAt IS NULL (not released)
 * - AND (expiredAt IS NULL OR expiredAt > anchorDate) (not expired)
 *
 * Useful for validating downgrade capacity constraints.
 * Uses a database COUNT query for efficiency instead of fetching all records.
 *
 * @param params - subscriptionId, resourceId, and optional anchorDate for time-based filtering
 * @param transaction - Database transaction
 * @returns Count of active claims
 */
export const countActiveResourceClaims = async (
  params: {
    subscriptionId: string
    resourceId: string
    anchorDate?: number
  },
  transaction: DbTransaction
): Promise<number> => {
  const now = params.anchorDate ?? Date.now()
  const result = await transaction
    .select({ count: count() })
    .from(resourceClaims)
    .where(
      and(
        eq(resourceClaims.subscriptionId, params.subscriptionId),
        eq(resourceClaims.resourceId, params.resourceId),
        isNull(resourceClaims.releasedAt),
        or(
          isNull(resourceClaims.expiredAt),
          gt(resourceClaims.expiredAt, now)
        )
      )
    )
  return result[0]?.count ?? 0
}

/**
 * Batch counts active (non-released, non-expired) claims for a subscription across multiple resources.
 * More efficient than calling countActiveResourceClaims for each resource individually.
 * Uses a single GROUP BY query to count claims per resource.
 *
 * Active claims are those where:
 * - releasedAt IS NULL (not released)
 * - AND (expiredAt IS NULL OR expiredAt > NOW()) (not expired)
 *
 * @param params - subscriptionId and array of resourceIds to count
 * @param transaction - Database transaction
 * @returns Map of resourceId to count of active claims
 */
export const countActiveResourceClaimsBatch = async (
  params: {
    subscriptionId: string
    resourceIds: string[]
  },
  transaction: DbTransaction
): Promise<Map<string, number>> => {
  if (params.resourceIds.length === 0) {
    return new Map()
  }

  const now = Date.now()
  const result = await transaction
    .select({
      resourceId: resourceClaims.resourceId,
      count: count(),
    })
    .from(resourceClaims)
    .where(
      and(
        eq(resourceClaims.subscriptionId, params.subscriptionId),
        inArray(resourceClaims.resourceId, params.resourceIds),
        isNull(resourceClaims.releasedAt),
        or(
          isNull(resourceClaims.expiredAt),
          gt(resourceClaims.expiredAt, now)
        )
      )
    )
    .groupBy(resourceClaims.resourceId)

  // Build map with counts, defaulting to 0 for resources with no claims
  const countMap = new Map<string, number>()
  for (const resourceId of params.resourceIds) {
    countMap.set(resourceId, 0)
  }
  for (const row of result) {
    countMap.set(row.resourceId, row.count)
  }

  return countMap
}

/**
 * Finds active claims by multiple externalIds for a given resource and subscription.
 * Active claims are those where:
 * - releasedAt IS NULL (not released)
 * - AND (expiredAt IS NULL OR expiredAt > NOW()) (not expired)
 *
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
  const now = Date.now()
  const result = await transaction
    .select()
    .from(resourceClaims)
    .where(
      and(
        eq(resourceClaims.resourceId, params.resourceId),
        eq(resourceClaims.subscriptionId, params.subscriptionId),
        inArray(resourceClaims.externalId, params.externalIds),
        isNull(resourceClaims.releasedAt),
        or(
          isNull(resourceClaims.expiredAt),
          gt(resourceClaims.expiredAt, now)
        )
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
