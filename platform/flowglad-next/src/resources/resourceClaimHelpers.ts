import { FeatureType } from '@db-core/enums'
import type { ResourceClaim } from '@db-core/schema/resourceClaims'
import { resourceClaims } from '@db-core/schema/resourceClaims'
import type { Resource } from '@db-core/schema/resources'
import type { SubscriptionItemFeature } from '@db-core/schema/subscriptionItemFeatures'
import { metadataSchema } from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import * as core from 'nanoid'
import { z } from 'zod'
import {
  bulkReleaseResourceClaims,
  countActiveResourceClaims,
  selectActiveClaimByExternalId,
  selectActiveClaimsByExternalIds,
  selectActiveResourceClaims,
  selectResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeaturesBySubscriptionItemIds } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  selectCurrentlyActiveSubscriptionItems,
  selectSubscriptionItemsIncludingScheduled,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import { panic } from '@/errors'

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Schema for claiming resources.
 * Exactly one of quantity, externalId, or externalIds must be provided.
 */
export const claimResourceInputSchema = z
  .object({
    resourceSlug: z
      .string()
      .describe('The slug of the resource to claim'),
    subscriptionId: z
      .string()
      .optional()
      .describe(
        'Optional subscription ID. If not provided, will use the first active subscription.'
      ),
    metadata: metadataSchema
      .optional()
      .describe('Optional metadata to attach to the claim(s)'),
    // Mutually exclusive - exactly one must be provided:
    quantity: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Create N anonymous claims without external identifiers.'
      ),
    externalId: z
      .string()
      .max(255)
      .optional()
      .describe(
        'Create a single named claim with this external identifier (idempotent).'
      ),
    externalIds: z
      .array(z.string().max(255))
      .nonempty()
      .optional()
      .describe(
        'Create multiple named claims with these external identifiers (idempotent per ID).'
      ),
  })
  .refine(
    (data) => {
      const provided = [
        data.quantity !== undefined,
        data.externalId !== undefined,
        data.externalIds !== undefined,
      ].filter(Boolean)
      return provided.length === 1
    },
    {
      message:
        'Exactly one of quantity, externalId, or externalIds must be provided',
    }
  )

export type ClaimResourceInput = z.infer<
  typeof claimResourceInputSchema
>

/**
 * Schema for releasing resources.
 * Exactly one of quantity, externalId, externalIds, or claimIds must be provided.
 */
export const releaseResourceInputSchema = z
  .object({
    resourceSlug: z
      .string()
      .describe('The slug of the resource to release'),
    subscriptionId: z
      .string()
      .optional()
      .describe(
        'Optional subscription ID. If not provided, will use the first active subscription.'
      ),
    // Mutually exclusive - exactly one must be provided:
    quantity: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Release N anonymous claims (FIFO order). Only releases claims without external identifiers.'
      ),
    externalId: z
      .string()
      .max(255)
      .optional()
      .describe(
        'Release a specific named claim by its external identifier.'
      ),
    externalIds: z
      .array(z.string().max(255))
      .nonempty()
      .optional()
      .describe(
        'Release multiple named claims by their external identifiers.'
      ),
    claimIds: z
      .array(z.string())
      .nonempty()
      .optional()
      .describe(
        'Release specific claims by their claim IDs (works for both anonymous and named claims).'
      ),
  })
  .refine(
    (data) => {
      const provided = [
        data.quantity !== undefined,
        data.externalId !== undefined,
        data.externalIds !== undefined,
        data.claimIds !== undefined,
      ].filter(Boolean)
      return provided.length === 1
    },
    {
      message:
        'Exactly one of quantity, externalId, externalIds, or claimIds must be provided',
    }
  )

export type ReleaseResourceInput = z.infer<
  typeof releaseResourceInputSchema
>

/**
 * Schema for getting resource usage.
 */
export const getResourceUsageInputSchema = z
  .object({
    resourceSlug: z
      .string()
      .optional()
      .describe(
        'The slug of the resource to get usage for. Exactly one of resourceSlug or resourceId must be provided.'
      ),
    resourceId: z
      .string()
      .optional()
      .describe(
        'The ID of the resource to get usage for. Exactly one of resourceSlug or resourceId must be provided.'
      ),
    subscriptionId: z
      .string()
      .optional()
      .describe(
        'Optional subscription ID. If not provided, will use the first active subscription.'
      ),
  })
  .refine(
    (data) => {
      const provided = [
        data.resourceSlug !== undefined,
        data.resourceId !== undefined,
      ].filter(Boolean)
      return provided.length === 1
    },
    {
      message:
        'Exactly one of resourceSlug or resourceId must be provided',
    }
  )

export type GetResourceUsageInput = z.infer<
  typeof getResourceUsageInputSchema
>

// ============================================================================
// Raw SQL Result Schemas (for runtime validation)
// ============================================================================

/**
 * Schema for validating raw SQL results from resource_claims table.
 * Uses snake_case to match PostgreSQL column names.
 */
const resourceClaimRawRowSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  created_by_commit: z.string().nullable(),
  updated_by_commit: z.string().nullable(),
  position: z.number(),
  organization_id: z.string(),
  resource_id: z.string(),
  subscription_id: z.string(),
  pricing_model_id: z.string(),
  external_id: z.string().nullable(),
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()])
    )
    .nullable(),
  livemode: z.boolean(),
  claimed_at: z.number(),
  released_at: z.number().nullable(),
  release_reason: z.string().nullable(),
  expired_at: z.number().nullable(),
})

type ResourceClaimRawRow = z.infer<typeof resourceClaimRawRowSchema>

/**
 * Transform a validated raw row to the camelCase ResourceClaim.Record format
 */
const transformRawRowToRecord = (
  row: ResourceClaimRawRow
): ResourceClaim.Record => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdByCommit: row.created_by_commit,
  updatedByCommit: row.updated_by_commit,
  position: row.position,
  organizationId: row.organization_id,
  resourceId: row.resource_id,
  subscriptionId: row.subscription_id,
  pricingModelId: row.pricing_model_id,
  externalId: row.external_id,
  metadata: row.metadata,
  livemode: row.livemode,
  claimedAt: row.claimed_at,
  releasedAt: row.released_at,
  releaseReason: row.release_reason,
  expiredAt: row.expired_at,
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolves a subscription ID. If not provided, finds the active subscription
 * for the customer (based on organization context).
 *
 * When subscriptionId is provided:
 * - Fetches the subscription and validates ownership (organizationId and customerId must match)
 * - Throws if subscription not found or ownership doesn't match
 *
 * When subscriptionId is omitted:
 * - Finds all subscriptions for the customer/organization
 * - Filters to active (non-terminal) subscriptions
 * - Returns the subscription if exactly one exists
 * - Throws ambiguity error if multiple active subscriptions exist
 * - Throws not found error if no active subscriptions exist
 */
const resolveSubscription = async (
  params: {
    subscriptionId?: string
    organizationId: string
    customerId: string
  },
  transaction: DbTransaction
) => {
  if (params.subscriptionId) {
    const subscription = (
      await selectSubscriptionById(params.subscriptionId, transaction)
    ).unwrap()

    if (!subscription) {
      panic(
        `Subscription with id "${params.subscriptionId}" not found`
      )
    }

    // Validate ownership - subscription must belong to the specified organization and customer
    if (subscription.organizationId !== params.organizationId) {
      panic(
        `Subscription "${params.subscriptionId}" does not belong to organization "${params.organizationId}"`
      )
    }

    if (subscription.customerId !== params.customerId) {
      panic(
        `Subscription "${params.subscriptionId}" does not belong to customer "${params.customerId}"`
      )
    }

    return subscription
  }

  // Find all subscriptions for the customer in this organization
  const subscriptionsResult = await selectSubscriptions(
    {
      customerId: params.customerId,
      organizationId: params.organizationId,
    },
    transaction
  )

  // Filter to only active (non-terminal) subscriptions
  const activeSubscriptions = subscriptionsResult.filter(
    (s) => !isSubscriptionInTerminalState(s.status)
  )

  if (activeSubscriptions.length === 0) {
    panic(
      'No active subscription found. Please provide a subscriptionId.'
    )
  }

  if (activeSubscriptions.length > 1) {
    panic(
      `Multiple active subscriptions found (${activeSubscriptions.length}). ` +
        'Please provide a subscriptionId to specify which subscription to use.'
    )
  }

  return activeSubscriptions[0]
}

/**
 * Finds a resource by slug within the context of a subscription's pricing model.
 */
const findResourceBySlug = async (
  params: {
    resourceSlug: string
    pricingModelId: string
    organizationId: string
  },
  transaction: DbTransaction
): Promise<Resource.Record> => {
  const [resource] = await selectResources(
    {
      slug: params.resourceSlug,
      pricingModelId: params.pricingModelId,
      organizationId: params.organizationId,
    },
    transaction
  )

  if (!resource) {
    panic(
      `Resource with slug "${params.resourceSlug}" not found in pricing model`
    )
  }

  return resource
}

/**
 * Gets the aggregated resource capacity from all active subscription item features
 * that provide the specified resource.
 *
 * This aggregates capacity across multiple features (e.g., base plan + add-ons)
 * to get the total capacity available for a resource on a subscription.
 *
 * "Active" means:
 * 1. Parent subscription item is active (expiresAt IS NULL OR expiresAt > now())
 * 2. Feature itself is not expired (expiredAt IS NULL)
 *
 * @param params - subscriptionId and resourceId to aggregate capacity for
 * @param transaction - Database transaction
 * @returns Object with totalCapacity and array of contributing featureIds
 */
export const getAggregatedResourceCapacity = async (
  params: {
    subscriptionId: string
    resourceId: string
    anchorDate?: number
  },
  transaction: DbTransaction
): Promise<{ totalCapacity: number; featureIds: string[] }> => {
  const now = params.anchorDate ?? Date.now()

  // Get all currently active subscription items for this subscription
  const activeItems = await selectCurrentlyActiveSubscriptionItems(
    { subscriptionId: params.subscriptionId },
    now,
    transaction
  )

  if (activeItems.length === 0) {
    return { totalCapacity: 0, featureIds: [] }
  }

  const subscriptionItemIds = activeItems.map((item) => item.id)

  // Get all subscription item features for these active items
  const allFeatures =
    await selectSubscriptionItemFeaturesBySubscriptionItemIds(
      subscriptionItemIds,
      transaction
    )

  // Filter to Resource features for our resource that are not expired
  const resourceFeatures = allFeatures.filter(
    (f): f is SubscriptionItemFeature.ResourceRecord =>
      f.type === FeatureType.Resource &&
      f.resourceId === params.resourceId &&
      (f.expiredAt === null || f.expiredAt > now)
  )

  // Sum up the capacity
  const totalCapacity = resourceFeatures.reduce(
    (sum, feature) => sum + feature.amount,
    0
  )

  return {
    totalCapacity,
    featureIds: resourceFeatures.map((f) => f.id),
  }
}

/**
 * Batch version of getAggregatedResourceCapacity.
 * Fetches active subscription items and features once, then aggregates
 * capacity for multiple resources in a single pass.
 *
 * This avoids N+1 queries when listing usages for multiple resources.
 *
 * @param params - subscriptionId and array of resourceIds
 * @param transaction - Database transaction
 * @returns Map of resourceId -> { totalCapacity, featureIds }
 */
export const getAggregatedResourceCapacityBatch = async (
  params: {
    subscriptionId: string
    resourceIds: string[]
  },
  transaction: DbTransaction
): Promise<
  Map<string, { totalCapacity: number; featureIds: string[] }>
> => {
  const result = new Map<
    string,
    { totalCapacity: number; featureIds: string[] }
  >()

  // Initialize all resources with 0 capacity
  for (const resourceId of params.resourceIds) {
    result.set(resourceId, { totalCapacity: 0, featureIds: [] })
  }

  if (params.resourceIds.length === 0) {
    return result
  }

  const now = Date.now()

  // 1. Fetch active subscription items ONCE
  const activeItems = await selectCurrentlyActiveSubscriptionItems(
    { subscriptionId: params.subscriptionId },
    now,
    transaction
  )

  if (activeItems.length === 0) {
    return result
  }

  const subscriptionItemIds = activeItems.map((item) => item.id)

  // 2. Fetch all features for those items ONCE
  const allFeatures =
    await selectSubscriptionItemFeaturesBySubscriptionItemIds(
      subscriptionItemIds,
      transaction
    )

  // 3. Create a set of requested resource IDs for O(1) lookup
  const requestedResourceIds = new Set(params.resourceIds)

  // 4. Filter to Resource features that match our requested resources
  const resourceFeatures = allFeatures.filter(
    (f): f is SubscriptionItemFeature.ResourceRecord =>
      f.type === FeatureType.Resource &&
      f.resourceId !== null &&
      requestedResourceIds.has(f.resourceId) &&
      (f.expiredAt === null || f.expiredAt > now)
  )

  // 5. Aggregate capacity per resource
  for (const feature of resourceFeatures) {
    const existing = result.get(feature.resourceId!)!
    existing.totalCapacity += feature.amount
    existing.featureIds.push(feature.id)
  }

  return result
}

/**
 * Information about a scheduled capacity change.
 */
export interface ScheduledCapacityChange {
  /**
   * The capacity that will be available after the scheduled change.
   * 0 if the subscription is scheduled to cancel.
   */
  futureCapacity: number
  /**
   * When the scheduled change takes effect (timestamp in ms).
   * This is either:
   * - cancelScheduledAt for scheduled cancellations
   * - The addedDate of the next scheduled subscription item change
   */
  effectiveAt: number
  /**
   * Why capacity is changing.
   */
  reason: 'scheduled_cancellation' | 'scheduled_adjustment'
}

/**
 * Gets the aggregated resource capacity at a specific point in time.
 * This is similar to getAggregatedResourceCapacity but uses an explicit
 * anchor time instead of Date.now().
 *
 * @param params - subscriptionId, resourceId, and anchorTime to calculate capacity at
 * @param transaction - Database transaction
 * @returns Object with totalCapacity at that time
 */
export const getAggregatedResourceCapacityAtTime = async (
  params: {
    subscriptionId: string
    resourceId: string
    anchorTime: number
  },
  transaction: DbTransaction
): Promise<{ totalCapacity: number }> => {
  const { anchorTime } = params

  // Get all active subscription items at the specified anchor time
  const activeItems = await selectCurrentlyActiveSubscriptionItems(
    { subscriptionId: params.subscriptionId },
    anchorTime,
    transaction
  )

  if (activeItems.length === 0) {
    return { totalCapacity: 0 }
  }

  const subscriptionItemIds = activeItems.map((item) => item.id)

  // Get all subscription item features for these active items
  const allFeatures =
    await selectSubscriptionItemFeaturesBySubscriptionItemIds(
      subscriptionItemIds,
      transaction
    )

  // Filter to Resource features for our resource that are not expired at anchor time
  const resourceFeatures = allFeatures.filter(
    (f): f is SubscriptionItemFeature.ResourceRecord =>
      f.type === FeatureType.Resource &&
      f.resourceId === params.resourceId &&
      (f.expiredAt === null || f.expiredAt > anchorTime)
  )

  // Sum up the capacity
  const totalCapacity = resourceFeatures.reduce(
    (sum, feature) => sum + feature.amount,
    0
  )

  return { totalCapacity }
}

/**
 * Gets the next scheduled capacity change for a resource on a subscription.
 *
 * This checks:
 * 1. If the subscription has cancelScheduledAt set (full cancellation)
 * 2. If there are subscription items scheduled to become active in the future
 *
 * Returns null if there's no scheduled change that would affect capacity.
 *
 * @param params - subscriptionId and resourceId
 * @param subscription - The subscription record (needed for cancelScheduledAt)
 * @param transaction - Database transaction
 * @returns ScheduledCapacityChange if there's a scheduled change, null otherwise
 */
export const getScheduledCapacityChange = async (
  params: {
    subscriptionId: string
    resourceId: string
  },
  subscription: { cancelScheduledAt: number | null },
  transaction: DbTransaction
): Promise<ScheduledCapacityChange | null> => {
  const now = Date.now()

  // Check for scheduled cancellation
  if (
    subscription.cancelScheduledAt &&
    subscription.cancelScheduledAt > now
  ) {
    return {
      futureCapacity: 0,
      effectiveAt: subscription.cancelScheduledAt,
      reason: 'scheduled_cancellation',
    }
  }

  // Check for scheduled subscription item changes
  // Get all subscription items including future scheduled ones (not just currently active)
  const allItems = await selectSubscriptionItemsIncludingScheduled(
    { subscriptionId: params.subscriptionId },
    now,
    transaction
  )

  // Find items that haven't started yet (addedDate > now)
  const futureItems = allItems.filter((item) => item.addedDate > now)

  if (futureItems.length === 0) {
    // No scheduled changes
    return null
  }

  // Find the soonest future change
  const soonestFutureDate = Math.min(
    ...futureItems.map((item) => item.addedDate)
  )

  // Calculate capacity at that future time
  const { totalCapacity: futureCapacity } =
    await getAggregatedResourceCapacityAtTime(
      {
        subscriptionId: params.subscriptionId,
        resourceId: params.resourceId,
        anchorTime: soonestFutureDate,
      },
      transaction
    )

  // Get current capacity to compare
  const { totalCapacity: currentCapacity } =
    await getAggregatedResourceCapacity(
      {
        subscriptionId: params.subscriptionId,
        resourceId: params.resourceId,
      },
      transaction
    )

  // Only return if capacity is decreasing (downgrade)
  if (futureCapacity < currentCapacity) {
    return {
      futureCapacity,
      effectiveAt: soonestFutureDate,
      reason: 'scheduled_adjustment',
    }
  }

  return null
}

const MAX_OPTIMISTIC_LOCK_RETRIES = 3

/**
 * Inserts resource claims using optimistic locking (compare-and-swap).
 *
 * This function:
 * 1. Reads the current claim count
 * 2. Validates capacity
 * 3. Uses a batched conditional INSERT that only succeeds if the count hasn't changed
 * 4. Retries on conflict (another transaction modified the count)
 *
 * IMPORTANT: All claims are inserted in a single atomic statement using UNNEST.
 * This ensures either ALL claims are inserted or NONE are, preventing partial
 * inserts that could cause duplicates on retry.
 *
 * This approach avoids blocking (unlike SELECT ... FOR UPDATE) and provides
 * better throughput for low-contention scenarios (which resource claims are).
 *
 * RACE CONDITION EDGE CASE:
 * If capacity validation passes (e.g., 2 available) but another transaction
 * claims resources before our INSERT executes, the conditional INSERT will
 * insert 0 rows (not fail). We detect this by checking rows.length and retry
 * with a fresh count. After MAX_OPTIMISTIC_LOCK_RETRIES failures, we throw
 * an error. This is expected behavior under high contention and ensures we
 * never over-claim capacity.
 *
 * @param params - subscriptionId, resourceId, expectedCount, and claims to insert
 * @param transaction - Database transaction
 * @returns Object with success flag and inserted claims
 */
const insertClaimsWithOptimisticLock = async (
  params: {
    subscriptionId: string
    resourceId: string
    organizationId: string
    pricingModelId: string
    livemode: boolean
    claimsToInsert: Array<{
      externalId: string | null
      metadata: Record<string, string | number | boolean> | null
      expiredAt?: number | null
    }>
  },
  transaction: DbTransaction
): Promise<{ success: boolean; claims: ResourceClaim.Record[] }> => {
  const {
    subscriptionId,
    resourceId,
    organizationId,
    pricingModelId,
    livemode,
    claimsToInsert,
  } = params

  if (claimsToInsert.length === 0) {
    return { success: true, claims: [] }
  }

  for (
    let attempt = 0;
    attempt < MAX_OPTIMISTIC_LOCK_RETRIES;
    attempt++
  ) {
    // 1. Read current state
    const currentCount = await countActiveResourceClaims(
      { subscriptionId, resourceId },
      transaction
    )
    const { totalCapacity } = await getAggregatedResourceCapacity(
      { subscriptionId, resourceId },
      transaction
    )

    // 2. Validate capacity
    const requested = claimsToInsert.length
    const available = totalCapacity - currentCount

    if (requested > available) {
      panic(
        `No available capacity. Requested: ${requested}, Available: ${available}, Capacity: ${totalCapacity}`
      )
    }

    // 3. Batched conditional insert - all claims in one atomic statement
    // Uses UNNEST to expand arrays into rows, ensuring either ALL claims
    // are inserted or NONE are (prevents partial insert bug on retry)
    const valuesSql = sql.join(
      claimsToInsert.map((claim) => {
        const meta = claim.metadata
          ? JSON.stringify(claim.metadata)
          : null
        const id = `res_claim_${core.nanoid()}`
        // Convert expiredAt to ISO timestamp string for PostgreSQL, or null
        const expiredAtValue =
          claim.expiredAt != null
            ? new Date(claim.expiredAt).toISOString()
            : null
        return sql`(${id}, ${claim.externalId}, ${meta}, ${expiredAtValue})`
      }),
      sql`, `
    )

    const result = await transaction.execute(sql`
      INSERT INTO ${resourceClaims} (
        id,
        organization_id, resource_id, subscription_id,
        pricing_model_id, external_id, metadata, livemode, expired_at
      )
      SELECT
        id,
        ${organizationId},
        ${resourceId},
        ${subscriptionId},
        ${pricingModelId},
        ext_id,
        meta::jsonb,
        ${livemode},
        exp_at::timestamptz
      FROM (
        VALUES ${valuesSql}
      ) AS t(id, ext_id, meta, exp_at)
      WHERE (
        SELECT COUNT(*) FROM ${resourceClaims}
        WHERE subscription_id = ${subscriptionId}
          AND resource_id = ${resourceId}
          AND released_at IS NULL
          AND (expired_at IS NULL OR expired_at > NOW())
      ) = ${currentCount}
      RETURNING
        id,
        (extract(epoch from created_at) * 1000)::double precision as created_at,
        (extract(epoch from updated_at) * 1000)::double precision as updated_at,
        created_by_commit,
        updated_by_commit,
        position::double precision as position,
        organization_id,
        resource_id,
        subscription_id,
        pricing_model_id,
        external_id,
        metadata,
        livemode,
        (extract(epoch from claimed_at) * 1000)::double precision as claimed_at,
        case
          when released_at is null
            then null
          else (extract(epoch from released_at) * 1000)::double precision
        end as released_at,
        release_reason,
        case
          when expired_at is null
            then null
          else (extract(epoch from expired_at) * 1000)::double precision
        end as expired_at
    `)

    // Validate raw SQL results with Zod for runtime safety
    const rows = z.array(resourceClaimRawRowSchema).parse(result)

    // 4. Check if all claims were inserted (atomic - all or nothing)
    if (rows.length === claimsToInsert.length) {
      const insertedClaims = rows.map(transformRawRowToRecord)
      return { success: true, claims: insertedClaims }
    }

    // 5. Conflict detected - count changed, nothing was inserted, retry
    if (attempt < MAX_OPTIMISTIC_LOCK_RETRIES - 1) {
      // eslint-disable-next-line no-console
      console.log(
        `Optimistic lock conflict on claim insert, retry ${attempt + 1}/${MAX_OPTIMISTIC_LOCK_RETRIES}`
      )
    }
  }

  panic(
    'Max retries exceeded due to concurrent modifications to resource claims'
  )
}

// ============================================================================
// Core Transaction Functions
// ============================================================================

export interface ClaimResourceTransactionParams {
  organizationId: string
  customerId: string
  input: ClaimResourceInput
}

export interface ClaimResourceResult {
  claims: ResourceClaim.Record[]
  usage: {
    resourceSlug: string
    resourceId: string
    capacity: number
    claimed: number
    available: number
  }
  /**
   * Information about any temporary claims that were created.
   * Temporary claims are created when claiming resources during an interim period
   * (after scheduling a downgrade but before it takes effect) and the claim
   * would exceed the future reduced capacity.
   */
  temporaryClaims?: {
    /** IDs of the claims that are temporary */
    claimIds: string[]
    /** When these claims will expire (timestamp in ms) */
    expiresAt: number
    /** Human-readable explanation of why these claims are temporary */
    reason: string
  }
}

/**
 * Claims resources for a subscription.
 *
 * Uses optimistic locking to ensure atomic capacity validation and claim creation.
 * Capacity is aggregated across all active subscription item features that provide
 * the resource.
 *
 * Modes:
 * - quantity: Creates N anonymous claims (externalId = null)
 * - externalId: Creates a single named claim with the given externalId (idempotent)
 * - externalIds: Creates multiple named claims with the given externalIds (idempotent per ID)
 *
 * @throws Error if subscription is in a terminal state
 * @throws Error if capacity is exhausted
 * @throws Error if resource is not found or has no capacity on this subscription
 */
export async function claimResourceTransaction(
  params: ClaimResourceTransactionParams,
  transaction: DbTransaction
): Promise<ClaimResourceResult> {
  const { organizationId, customerId, input } = params

  // 1. Resolve subscription
  const subscription = await resolveSubscription(
    {
      subscriptionId: input.subscriptionId,
      organizationId,
      customerId,
    },
    transaction
  )

  // 2. Validate subscription is not in terminal state
  if (isSubscriptionInTerminalState(subscription.status)) {
    panic(
      `Cannot claim resources: Subscription ${subscription.id} is not active (status: ${subscription.status})`
    )
  }

  // 3. Find the resource
  const resource = await findResourceBySlug(
    {
      resourceSlug: input.resourceSlug,
      pricingModelId: subscription.pricingModelId,
      organizationId,
    },
    transaction
  )

  // 4. Verify the subscription has capacity for this resource
  const { totalCapacity, featureIds } =
    await getAggregatedResourceCapacity(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

  if (featureIds.length === 0) {
    panic(
      `No Resource feature found for resource ${resource.id} in subscription ${subscription.id}`
    )
  }

  // 5. Determine how many claims we need to create
  // This allows idempotent operations to return early
  let claimsToCreate: Array<{
    externalId: string | null
    metadata: Record<string, string | number | boolean> | null
    expiredAt?: number | null
  }> = []

  if (input.quantity !== undefined) {
    // Anonymous mode: create N claims without external identifiers
    claimsToCreate = Array.from({ length: input.quantity }, () => ({
      externalId: null,
      metadata: input.metadata ?? null,
    }))
  } else if (input.externalId !== undefined) {
    // Named mode (single): check idempotency
    const existing = await selectActiveClaimByExternalId(
      {
        resourceId: resource.id,
        subscriptionId: subscription.id,
        externalId: input.externalId,
      },
      transaction
    )

    if (existing) {
      // Idempotent: return existing claim
      const usage = await getResourceUsage(
        subscription.id,
        resource.id,
        transaction
      )
      return {
        claims: [existing],
        usage: {
          resourceSlug: resource.slug,
          resourceId: resource.id,
          ...usage,
        },
      }
    }

    claimsToCreate = [
      {
        externalId: input.externalId,
        metadata: input.metadata ?? null,
      },
    ]
  } else if (input.externalIds !== undefined) {
    // Named mode (multiple): check idempotency for each in a single query
    const existingClaims = await selectActiveClaimsByExternalIds(
      {
        resourceId: resource.id,
        subscriptionId: subscription.id,
        externalIds: input.externalIds,
      },
      transaction
    )
    const existingExternalIds = new Set(
      existingClaims.map((c) => c.externalId)
    )
    const newExternalIds = input.externalIds.filter(
      (id) => !existingExternalIds.has(id)
    )

    // Only create claims for new externalIds
    claimsToCreate = newExternalIds.map((externalId) => ({
      externalId,
      metadata: input.metadata ?? null,
    }))

    // If all claims already exist, return them
    if (claimsToCreate.length === 0) {
      const usage = await getResourceUsage(
        subscription.id,
        resource.id,
        transaction
      )
      return {
        claims: existingClaims,
        usage: {
          resourceSlug: resource.slug,
          resourceId: resource.id,
          ...usage,
        },
      }
    }
  }

  // 5b. Check for scheduled capacity changes
  // If there's a scheduled downgrade or cancellation, some claims may need to be temporary
  let temporaryClaimsInfo:
    | {
        claimIds: string[]
        expiresAt: number
        reason: string
      }
    | undefined

  const scheduledChange = await getScheduledCapacityChange(
    {
      subscriptionId: subscription.id,
      resourceId: resource.id,
    },
    subscription,
    transaction
  )

  if (scheduledChange) {
    // Get current claim count
    const currentClaimCount = await countActiveResourceClaims(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

    // Calculate how many claims can fit within future capacity
    const claimsAfterNew = currentClaimCount + claimsToCreate.length
    const excessClaims =
      claimsAfterNew - scheduledChange.futureCapacity

    if (excessClaims > 0) {
      // Some claims will exceed future capacity and need to be temporary
      // The last N claims (where N = excessClaims) should be temporary
      const permanentCount = Math.max(
        0,
        claimsToCreate.length - excessClaims
      )
      const reasonText =
        scheduledChange.reason === 'scheduled_cancellation'
          ? 'Claim valid until scheduled subscription cancellation takes effect'
          : 'Claim valid until scheduled downgrade takes effect'

      // Mark the excess claims as temporary
      claimsToCreate = claimsToCreate.map((claim, index) => ({
        ...claim,
        expiredAt:
          index >= permanentCount
            ? scheduledChange.effectiveAt
            : null,
      }))

      // Prepare temporary claims info for return value
      // Note: We'll fill in claimIds after the insert completes
      temporaryClaimsInfo = {
        claimIds: [], // Will be populated after insert
        expiresAt: scheduledChange.effectiveAt,
        reason: reasonText,
      }
    }
  }

  // 6. Insert claims using optimistic locking
  // This validates capacity and handles concurrent modifications via retry
  const { claims: newClaims } = await insertClaimsWithOptimisticLock(
    {
      subscriptionId: subscription.id,
      resourceId: resource.id,
      organizationId,
      pricingModelId: subscription.pricingModelId,
      livemode: subscription.livemode,
      claimsToInsert: claimsToCreate,
    },
    transaction
  )

  // 7. Populate temporary claim IDs if any claims are temporary
  if (temporaryClaimsInfo) {
    temporaryClaimsInfo.claimIds = newClaims
      .filter((claim) => claim.expiredAt !== null)
      .map((claim) => claim.id)
  }

  // 8. Get updated usage
  const usage = await getResourceUsage(
    subscription.id,
    resource.id,
    transaction
  )

  // Include any existing claims from idempotent checks (for externalIds mode)
  if (input.externalIds !== undefined) {
    // Re-fetch to get the complete list
    const allActiveClaims = await selectActiveResourceClaims(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

    // Filter to only the ones we were asked about
    const relevantClaims = allActiveClaims.filter(
      (c) =>
        c.externalId !== null &&
        input.externalIds!.includes(c.externalId)
    )

    // Check if any of the relevant claims are temporary
    const relevantTemporaryClaims = relevantClaims.filter(
      (c) => c.expiredAt !== null
    )
    const externalIdsTemporaryInfo =
      relevantTemporaryClaims.length > 0 && temporaryClaimsInfo
        ? {
            claimIds: relevantTemporaryClaims.map((c) => c.id),
            expiresAt: temporaryClaimsInfo.expiresAt,
            reason: temporaryClaimsInfo.reason,
          }
        : undefined

    return {
      claims: relevantClaims,
      usage: {
        resourceSlug: resource.slug,
        resourceId: resource.id,
        ...usage,
      },
      temporaryClaims: externalIdsTemporaryInfo,
    }
  }

  return {
    claims: newClaims,
    usage: {
      resourceSlug: resource.slug,
      resourceId: resource.id,
      ...usage,
    },
    temporaryClaims:
      temporaryClaimsInfo && temporaryClaimsInfo.claimIds.length > 0
        ? temporaryClaimsInfo
        : undefined,
  }
}

export interface ReleaseResourceTransactionParams {
  organizationId: string
  customerId: string
  input: ReleaseResourceInput
}

export interface ReleaseResourceResult {
  releasedClaims: ResourceClaim.Record[]
  usage: {
    resourceSlug: string
    resourceId: string
    capacity: number
    claimed: number
    available: number
  }
}

/**
 * Releases resource claims for a subscription.
 *
 * Claims are queried by (subscriptionId, resourceId) rather than by
 * subscriptionItemFeatureId, making this function resilient to subscription
 * adjustments that create new subscription items.
 *
 * Modes:
 * - quantity: Releases N anonymous claims (FIFO order, only where externalId IS NULL)
 * - externalId: Releases a specific named claim by its externalId
 * - externalIds: Releases multiple named claims by their externalIds
 * - claimIds: Releases specific claims by their IDs (works for both anonymous and named)
 *
 * @throws Error if trying to release more anonymous claims than exist
 * @throws Error if claim(s) not found
 */
export async function releaseResourceTransaction(
  params: ReleaseResourceTransactionParams,
  transaction: DbTransaction
): Promise<ReleaseResourceResult> {
  const { organizationId, customerId, input } = params

  // 1. Resolve subscription
  const subscription = await resolveSubscription(
    {
      subscriptionId: input.subscriptionId,
      organizationId,
      customerId,
    },
    transaction
  )

  // 2. Find the resource
  const resource = await findResourceBySlug(
    {
      resourceSlug: input.resourceSlug,
      pricingModelId: subscription.pricingModelId,
      organizationId,
    },
    transaction
  )

  // 3. Find claims to release based on mode
  // Claims are queried by (subscriptionId, resourceId) to be resilient to subscription adjustments
  let claimsToRelease: ResourceClaim.Record[] = []

  if (input.quantity !== undefined) {
    // Anonymous mode: release claims without externalId, FIFO order
    const activeClaims = await selectActiveResourceClaims(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

    // Filter to only anonymous claims (externalId is null)
    const anonymousClaims = activeClaims
      .filter((c) => c.externalId === null)
      .sort((a, b) => a.claimedAt - b.claimedAt) // FIFO order

    if (anonymousClaims.length < input.quantity) {
      panic(
        `Cannot release ${input.quantity} anonymous claims. Only ${anonymousClaims.length} exist. ` +
          `Use claimIds to release specific claims regardless of type.`
      )
    }

    claimsToRelease = anonymousClaims.slice(0, input.quantity)
  } else if (input.externalId !== undefined) {
    // Named mode: release a specific claim by its externalId
    const claim = await selectActiveClaimByExternalId(
      {
        resourceId: resource.id,
        subscriptionId: subscription.id,
        externalId: input.externalId,
      },
      transaction
    )

    if (!claim) {
      panic(
        `No active claim found with externalId "${input.externalId}"`
      )
    }

    claimsToRelease = [claim]
  } else if (input.externalIds !== undefined) {
    // Named mode: release multiple claims by their externalIds
    const claims = await selectActiveClaimsByExternalIds(
      {
        resourceId: resource.id,
        subscriptionId: subscription.id,
        externalIds: input.externalIds,
      },
      transaction
    )

    // Validate all were found
    if (claims.length !== input.externalIds.length) {
      const foundIds = new Set(claims.map((c) => c.externalId))
      const missing = input.externalIds.find(
        (id) => !foundIds.has(id)
      )
      panic(`No active claim found with externalId "${missing}"`)
    }

    claimsToRelease = claims
  } else if (input.claimIds !== undefined) {
    // Release by claim IDs
    const activeClaims = await selectActiveResourceClaims(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

    const activeClaimsById = new Map(
      activeClaims.map((c) => [c.id, c])
    )

    for (const claimId of input.claimIds) {
      const claim = activeClaimsById.get(claimId)
      if (!claim) {
        panic(`No active claim found with id "${claimId}"`)
      }
      claimsToRelease.push(claim)
    }
  }

  // 4. Release the claims in bulk
  const releasedClaims = await bulkReleaseResourceClaims(
    claimsToRelease.map((c) => c.id),
    'released',
    transaction
  )

  // 5. Get updated usage
  const usage = await getResourceUsage(
    subscription.id,
    resource.id,
    transaction
  )

  return {
    releasedClaims,
    usage: {
      resourceSlug: resource.slug,
      resourceId: resource.id,
      ...usage,
    },
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the resource usage for a subscription and resource.
 *
 * Capacity is aggregated across all active subscription item features
 * that provide the resource. Claims are counted by (subscriptionId, resourceId).
 *
 * @param subscriptionId - The subscription ID
 * @param resourceId - The resource ID
 * @param transaction - The database transaction
 * @param anchorDate - Optional anchor date for determining active items (defaults to Date.now())
 * @returns Object with capacity, claimed count, and available slots
 */
export async function getResourceUsage(
  subscriptionId: string,
  resourceId: string,
  transaction: DbTransaction,
  anchorDate?: number
): Promise<{ capacity: number; claimed: number; available: number }> {
  // Get aggregated capacity from all active features
  const { totalCapacity } = await getAggregatedResourceCapacity(
    { subscriptionId, resourceId, anchorDate },
    transaction
  )

  // Count active claims by (subscriptionId, resourceId)
  const claimed = await countActiveResourceClaims(
    { subscriptionId, resourceId, anchorDate },
    transaction
  )

  return {
    capacity: totalCapacity,
    claimed,
    available: totalCapacity - claimed,
  }
}

/**
 * Releases all active resource claims for a subscription.
 * Used when a subscription is canceled.
 *
 * @param subscriptionId - The subscription ID
 * @param reason - The reason for releasing (e.g., 'subscription_canceled')
 * @param transaction - The database transaction
 * @returns Object with the count of released claims
 */
export async function releaseAllResourceClaimsForSubscription(
  subscriptionId: string,
  reason: string,
  transaction: DbTransaction
): Promise<{ releasedCount: number }> {
  // Find all active claims for this subscription
  const activeClaims = await selectActiveResourceClaims(
    { subscriptionId },
    transaction
  )

  if (activeClaims.length === 0) {
    return { releasedCount: 0 }
  }

  // Release all claims in bulk
  const releasedClaims = await bulkReleaseResourceClaims(
    activeClaims.map((c) => c.id),
    reason,
    transaction
  )

  return { releasedCount: releasedClaims.length }
}

/**
 * Releases expired resource claims for a subscription.
 * Expired claims are those where expiredAt is not null and expiredAt <= NOW().
 *
 * This is useful for data cleanup - expired claims are already filtered out
 * of active claim queries, but this function explicitly sets releasedAt
 * for cleaner data management.
 *
 * @param subscriptionId - The subscription ID
 * @param transaction - The database transaction
 * @returns Object with the count of released claims
 */
export async function releaseExpiredResourceClaims(
  subscriptionId: string,
  transaction: DbTransaction
): Promise<{ releasedCount: number }> {
  const now = Date.now()

  // Find claims that are expired but not yet released
  // These are claims where:
  // - releasedAt IS NULL (not yet released)
  // - expiredAt IS NOT NULL (has an expiration)
  // - expiredAt <= now (expiration has passed)
  const expiredClaims = await selectResourceClaims(
    {
      subscriptionId,
      releasedAt: null,
    },
    transaction
  )

  // Filter to only expired claims
  const claimsToRelease = expiredClaims.filter(
    (claim) => claim.expiredAt !== null && claim.expiredAt <= now
  )

  if (claimsToRelease.length === 0) {
    return { releasedCount: 0 }
  }

  // Release all expired claims in bulk
  const releasedClaims = await bulkReleaseResourceClaims(
    claimsToRelease.map((c) => c.id),
    'expired',
    transaction
  )

  return { releasedCount: releasedClaims.length }
}
