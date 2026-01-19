import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ResourceClaim } from '@/db/schema/resourceClaims'
import { resourceClaims } from '@/db/schema/resourceClaims'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import {
  bulkReleaseResourceClaims,
  countActiveResourceClaims,
  selectActiveClaimByExternalId,
  selectActiveClaimsByExternalIds,
  selectActiveResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeaturesBySubscriptionItemIds } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { metadataSchema } from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { FeatureType } from '@/types'

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
    const subscription = await selectSubscriptionById(
      params.subscriptionId,
      transaction
    )

    if (!subscription) {
      throw new Error(
        `Subscription with id "${params.subscriptionId}" not found`
      )
    }

    // Validate ownership - subscription must belong to the specified organization and customer
    if (subscription.organizationId !== params.organizationId) {
      throw new Error(
        `Subscription "${params.subscriptionId}" does not belong to organization "${params.organizationId}"`
      )
    }

    if (subscription.customerId !== params.customerId) {
      throw new Error(
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
    throw new Error(
      'No active subscription found. Please provide a subscriptionId.'
    )
  }

  if (activeSubscriptions.length > 1) {
    throw new Error(
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
    throw new Error(
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
  },
  transaction: DbTransaction
): Promise<{ totalCapacity: number; featureIds: string[] }> => {
  const now = Date.now()

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
      throw new Error(
        `No available capacity. Requested: ${requested}, Available: ${available}, Capacity: ${totalCapacity}`
      )
    }

    // 3. Batched conditional insert - all claims in one atomic statement
    // Uses UNNEST to expand arrays into rows, ensuring either ALL claims
    // are inserted or NONE are (prevents partial insert bug on retry)
    const externalIds = claimsToInsert.map((c) => c.externalId)
    const metadataJsonStrings = claimsToInsert.map((c) =>
      c.metadata ? JSON.stringify(c.metadata) : null
    )

    const result = await transaction.execute<{
      id: string
      created_at: number
      updated_at: number
      created_by_commit: string | null
      updated_by_commit: string | null
      position: number
      organization_id: string
      resource_id: string
      subscription_id: string
      pricing_model_id: string
      external_id: string | null
      metadata: Record<string, string | number | boolean> | null
      livemode: boolean
      claimed_at: number
      released_at: number | null
      release_reason: string | null
    }>(sql`
      INSERT INTO ${resourceClaims} (
        organization_id, resource_id, subscription_id,
        pricing_model_id, external_id, metadata, livemode
      )
      SELECT
        ${organizationId},
        ${resourceId},
        ${subscriptionId},
        ${pricingModelId},
        ext_id,
        meta::jsonb,
        ${livemode}
      FROM UNNEST(
        ${externalIds}::text[],
        ${metadataJsonStrings}::text[]
      ) AS t(ext_id, meta)
      WHERE (
        SELECT COUNT(*) FROM ${resourceClaims}
        WHERE subscription_id = ${subscriptionId}
          AND resource_id = ${resourceId}
          AND released_at IS NULL
      ) = ${currentCount}
      RETURNING *
    `)

    // Drizzle's execute returns the rows directly
    const rows = result as unknown as Array<{
      id: string
      created_at: number
      updated_at: number
      created_by_commit: string | null
      updated_by_commit: string | null
      position: number
      organization_id: string
      resource_id: string
      subscription_id: string
      pricing_model_id: string
      external_id: string | null
      metadata: Record<string, string | number | boolean> | null
      livemode: boolean
      claimed_at: number
      released_at: number | null
      release_reason: string | null
    }>

    // 4. Check if all claims were inserted (atomic - all or nothing)
    if (rows.length === claimsToInsert.length) {
      const insertedClaims: ResourceClaim.Record[] = rows.map(
        (insertedRow) => ({
          id: insertedRow.id,
          createdAt: insertedRow.created_at,
          updatedAt: insertedRow.updated_at,
          createdByCommit: insertedRow.created_by_commit,
          updatedByCommit: insertedRow.updated_by_commit,
          position: insertedRow.position,
          organizationId: insertedRow.organization_id,
          resourceId: insertedRow.resource_id,
          subscriptionId: insertedRow.subscription_id,
          pricingModelId: insertedRow.pricing_model_id,
          externalId: insertedRow.external_id,
          metadata: insertedRow.metadata,
          livemode: insertedRow.livemode,
          claimedAt: insertedRow.claimed_at,
          releasedAt: insertedRow.released_at,
          releaseReason: insertedRow.release_reason,
        })
      )
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

  throw new Error(
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
    throw new Error(
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
    throw new Error(
      `No Resource feature found for resource ${resource.id} in subscription ${subscription.id}`
    )
  }

  // 5. Determine how many claims we need to create
  // This allows idempotent operations to return early
  let claimsToCreate: Array<{
    externalId: string | null
    metadata: Record<string, string | number | boolean> | null
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

  // 7. Get updated usage
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

    return {
      claims: relevantClaims,
      usage: {
        resourceSlug: resource.slug,
        resourceId: resource.id,
        ...usage,
      },
    }
  }

  return {
    claims: newClaims,
    usage: {
      resourceSlug: resource.slug,
      resourceId: resource.id,
      ...usage,
    },
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
      throw new Error(
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
      throw new Error(
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
      throw new Error(
        `No active claim found with externalId "${missing}"`
      )
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
        throw new Error(`No active claim found with id "${claimId}"`)
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
 * @returns Object with capacity, claimed count, and available slots
 */
export async function getResourceUsage(
  subscriptionId: string,
  resourceId: string,
  transaction: DbTransaction
): Promise<{ capacity: number; claimed: number; available: number }> {
  // Get aggregated capacity from all active features
  const { totalCapacity } = await getAggregatedResourceCapacity(
    { subscriptionId, resourceId },
    transaction
  )

  // Count active claims by (subscriptionId, resourceId)
  const claimed = await countActiveResourceClaims(
    { subscriptionId, resourceId },
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
