import { and, eq, isNull } from 'drizzle-orm'
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
 */
export const selectActiveResourceClaims = async (
  where: Omit<ResourceClaim.Where, 'releasedAt'>,
  transaction: DbTransaction
): Promise<ResourceClaim.Record[]> => {
  const allClaims = await selectResourceClaims(where, transaction)
  return allClaims.filter((claim) => claim.releasedAt === null)
}

/**
 * Counts active (non-released) claims for a given subscriptionItemFeatureId.
 * Useful for checking capacity against limits.
 */
export const countActiveClaimsForSubscriptionItemFeature = async (
  subscriptionItemFeatureId: string,
  transaction: DbTransaction
): Promise<number> => {
  const activeClaims = await selectActiveResourceClaims(
    { subscriptionItemFeatureId },
    transaction
  )
  return activeClaims.length
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
 * Releases all active claims for a given subscriptionItemFeatureId.
 * Used when a subscription item feature is detached or expired.
 */
export const releaseAllClaimsForSubscriptionItemFeature = async (
  subscriptionItemFeatureId: string,
  releaseReason: string,
  transaction: DbTransaction
): Promise<ResourceClaim.Record[]> => {
  const activeClaims = await selectActiveResourceClaims(
    { subscriptionItemFeatureId },
    transaction
  )

  return Promise.all(
    activeClaims.map((claim) =>
      releaseResourceClaim(
        { id: claim.id, releaseReason },
        transaction
      )
    )
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
 * Counts active (non-released) claims for a given subscription and resource.
 * Useful for validating downgrade capacity constraints.
 */
export const countActiveResourceClaims = async (
  params: {
    subscriptionId: string
    resourceId: string
  },
  transaction: DbTransaction
): Promise<number> => {
  const activeClaims = await selectActiveResourceClaims(
    {
      subscriptionId: params.subscriptionId,
      resourceId: params.resourceId,
    },
    transaction
  )
  return activeClaims.length
}
