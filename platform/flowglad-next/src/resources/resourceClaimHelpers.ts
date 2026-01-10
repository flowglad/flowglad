import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ResourceClaim } from '@/db/schema/resourceClaims'
import type { Resource } from '@/db/schema/resources'
import {
  type SubscriptionItemFeature,
  subscriptionItemFeatures,
} from '@/db/schema/subscriptionItemFeatures'
import {
  bulkInsertResourceClaims,
  bulkReleaseResourceClaims,
  countActiveClaimsForSubscriptionItemFeature,
  insertResourceClaim,
  selectActiveClaimByExternalId,
  selectActiveClaimsByExternalIds,
  selectActiveResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import {
  selectSubscriptionItemFeatures,
  selectSubscriptionItemFeaturesBySubscriptionItemIds,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
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
        'Create N anonymous (cattle-style) claims. Each claim will have externalId = null.'
      ),
    externalId: z
      .string()
      .max(255)
      .optional()
      .describe(
        'Create a single pet-style claim with this external identifier.'
      ),
    externalIds: z
      .array(z.string().max(255))
      .nonempty()
      .optional()
      .describe(
        'Create multiple pet-style claims with these external identifiers.'
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
        'Release N anonymous (cattle-style) claims. Only releases claims where externalId IS NULL. Will not release pet-style claims with externalIds.'
      ),
    externalId: z
      .string()
      .max(255)
      .optional()
      .describe(
        'Release a specific pet-style claim by its externalId'
      ),
    externalIds: z
      .array(z.string().max(255))
      .nonempty()
      .optional()
      .describe(
        'Release multiple pet-style claims by their externalIds'
      ),
    claimIds: z
      .array(z.string())
      .nonempty()
      .optional()
      .describe(
        'Release specific claims by their claim IDs (works for both cattle and pet claims)'
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
export const getResourceUsageInputSchema = z.object({
  resourceSlug: z
    .string()
    .optional()
    .describe('Optional resource slug to get usage for'),
  subscriptionId: z
    .string()
    .optional()
    .describe(
      'Optional subscription ID. If not provided, will use the first active subscription.'
    ),
})

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
 * Finds the SubscriptionItemFeature for a given resource and subscription.
 * This is needed to validate capacity and create claims.
 */
const findSubscriptionItemFeatureForResource = async (
  params: {
    subscriptionId: string
    resourceId: string
  },
  transaction: DbTransaction
): Promise<SubscriptionItemFeature.ResourceRecord> => {
  // First get all subscription items for this subscription
  const items = await selectSubscriptionItems(
    { subscriptionId: params.subscriptionId },
    transaction
  )

  if (items.length === 0) {
    throw new Error(
      `No subscription items found for subscription ${params.subscriptionId}`
    )
  }

  // Find subscription item features of type Resource with matching resourceId
  const subscriptionItemIds = items.map((item) => item.id)

  // Get all subscription item features for these subscription items in a single query
  const allFeatures =
    await selectSubscriptionItemFeaturesBySubscriptionItemIds(
      subscriptionItemIds,
      transaction
    )

  // Find the one matching our resource
  const resourceFeature = allFeatures.find(
    (f): f is SubscriptionItemFeature.ResourceRecord =>
      f.type === FeatureType.Resource &&
      f.resourceId === params.resourceId
  )

  if (!resourceFeature) {
    throw new Error(
      `No Resource feature found for resource ${params.resourceId} in subscription ${params.subscriptionId}`
    )
  }

  return resourceFeature
}

/**
 * Acquires a row-level lock on a subscription item feature for atomic capacity checking.
 *
 * This uses SELECT ... FOR UPDATE to acquire an exclusive lock on the row,
 * preventing concurrent transactions from reading/modifying the same row until
 * this transaction completes. This ensures that capacity checks and claim
 * creation are atomic and race-free.
 *
 * @param subscriptionItemFeatureId - The ID of the subscription item feature to lock
 * @param transaction - The database transaction
 * @returns The locked subscription item feature record
 * @throws Error if the subscription item feature is not found
 */
const acquireSubscriptionItemFeatureLock = async (
  subscriptionItemFeatureId: string,
  transaction: DbTransaction
): Promise<SubscriptionItemFeature.ResourceRecord> => {
  // Use raw SQL to perform SELECT ... FOR UPDATE for row-level locking
  const result = await transaction
    .select()
    .from(subscriptionItemFeatures)
    .where(eq(subscriptionItemFeatures.id, subscriptionItemFeatureId))
    .for('update')

  const feature = result[0]

  if (!feature) {
    throw new Error(
      `SubscriptionItemFeature ${subscriptionItemFeatureId} not found`
    )
  }

  if (feature.type !== FeatureType.Resource) {
    throw new Error(
      `SubscriptionItemFeature ${subscriptionItemFeatureId} is not a Resource type`
    )
  }

  return feature as SubscriptionItemFeature.ResourceRecord
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
    capacity: number
    claimed: number
    available: number
  }
}

/**
 * Claims resources for a subscription.
 *
 * Modes:
 * - quantity: Creates N anonymous "cattle" claims (externalId = null)
 * - externalId: Creates a single "pet" claim with the given externalId (idempotent)
 * - externalIds: Creates multiple "pet" claims with the given externalIds (idempotent per ID)
 *
 * @throws Error if subscription is in a terminal state
 * @throws Error if capacity is exhausted
 * @throws Error if resource or subscription item feature is not found
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

  // 4. Find the subscription item feature for this resource (without lock first)
  const subscriptionItemFeatureUnlocked =
    await findSubscriptionItemFeatureForResource(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

  // 5. Determine how many claims we need to create (before acquiring lock)
  // This allows idempotent operations to return early without acquiring the lock
  let claimsToCreate: Array<{
    externalId: string | null
    metadata: Record<string, string | number | boolean> | null
  }> = []

  if (input.quantity !== undefined) {
    // Cattle mode: create N anonymous claims
    claimsToCreate = Array.from({ length: input.quantity }, () => ({
      externalId: null,
      metadata: input.metadata ?? null,
    }))
  } else if (input.externalId !== undefined) {
    // Pet mode (single): check idempotency
    const existing = await selectActiveClaimByExternalId(
      {
        resourceId: resource.id,
        subscriptionId: subscription.id,
        externalId: input.externalId,
      },
      transaction
    )

    if (existing) {
      // Idempotent: return existing claim (no lock needed)
      const usage = await getResourceUsage(
        subscription.id,
        subscriptionItemFeatureUnlocked.id,
        transaction
      )
      return { claims: [existing], usage }
    }

    claimsToCreate = [
      {
        externalId: input.externalId,
        metadata: input.metadata ?? null,
      },
    ]
  } else if (input.externalIds !== undefined) {
    // Pet mode (multiple): check idempotency for each in a single query
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

    // If all claims already exist, return them (no lock needed)
    if (claimsToCreate.length === 0) {
      const usage = await getResourceUsage(
        subscription.id,
        subscriptionItemFeatureUnlocked.id,
        transaction
      )
      return { claims: existingClaims, usage }
    }
  }

  // 6. Acquire exclusive lock on subscription item feature row
  // This prevents race conditions where concurrent transactions could both
  // pass the capacity check and exceed the limit. The lock is held until
  // the transaction commits, ensuring atomic capacity validation and claim creation.
  const subscriptionItemFeature =
    await acquireSubscriptionItemFeatureLock(
      subscriptionItemFeatureUnlocked.id,
      transaction
    )

  const capacity = subscriptionItemFeature.amount

  // 7. Validate capacity (while holding the lock)
  const currentClaimedCount =
    await countActiveClaimsForSubscriptionItemFeature(
      subscriptionItemFeature.id,
      transaction
    )

  const available = capacity - currentClaimedCount
  const requested = claimsToCreate.length

  if (requested > available) {
    throw new Error(
      `No available capacity. Requested: ${requested}, Available: ${available}, Capacity: ${capacity}`
    )
  }

  // 8. Create the claims (while holding the lock)
  const claimInserts: ResourceClaim.Insert[] = claimsToCreate.map(
    (claim) => ({
      organizationId,
      subscriptionItemFeatureId: subscriptionItemFeature.id,
      resourceId: resource.id,
      subscriptionId: subscription.id,
      pricingModelId: subscription.pricingModelId,
      externalId: claim.externalId,
      metadata: claim.metadata,
      livemode: subscription.livemode,
    })
  )

  let newClaims: ResourceClaim.Record[]
  if (claimInserts.length === 1) {
    const claim = await insertResourceClaim(
      claimInserts[0],
      transaction
    )
    newClaims = [claim]
  } else {
    newClaims = await bulkInsertResourceClaims(
      claimInserts,
      transaction
    )
  }

  // 9. Get updated usage
  const usage = await getResourceUsage(
    subscription.id,
    subscriptionItemFeature.id,
    transaction
  )

  // Include any existing claims from idempotent checks (for externalIds mode)
  if (input.externalIds !== undefined) {
    // Re-fetch to get the complete list
    const allActiveClaims = await selectActiveResourceClaims(
      {
        subscriptionItemFeatureId: subscriptionItemFeature.id,
      },
      transaction
    )

    // Filter to only the ones we were asked about
    const relevantClaims = allActiveClaims.filter(
      (c) =>
        c.externalId !== null &&
        input.externalIds!.includes(c.externalId)
    )

    return { claims: relevantClaims, usage }
  }

  return { claims: newClaims, usage }
}

export interface ReleaseResourceTransactionParams {
  organizationId: string
  customerId: string
  input: ReleaseResourceInput
}

export interface ReleaseResourceResult {
  releasedClaims: ResourceClaim.Record[]
  usage: {
    capacity: number
    claimed: number
    available: number
  }
}

/**
 * Releases resource claims for a subscription.
 *
 * Modes:
 * - quantity: Releases N anonymous "cattle" claims (FIFO, only where externalId IS NULL)
 * - externalId: Releases a specific "pet" claim by its externalId
 * - externalIds: Releases multiple "pet" claims by their externalIds
 * - claimIds: Releases specific claims by their IDs (works for both cattle and pet)
 *
 * @throws Error if trying to release more cattle claims than exist
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

  // 3. Find the subscription item feature for this resource
  const subscriptionItemFeature =
    await findSubscriptionItemFeatureForResource(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

  // 4. Find claims to release based on mode
  let claimsToRelease: ResourceClaim.Record[] = []

  if (input.quantity !== undefined) {
    // Release cattle claims only (externalId IS NULL), FIFO order
    const activeClaims = await selectActiveResourceClaims(
      { subscriptionItemFeatureId: subscriptionItemFeature.id },
      transaction
    )

    // Filter to only cattle claims (externalId is null)
    const cattleClaims = activeClaims
      .filter((c) => c.externalId === null)
      .sort((a, b) => a.claimedAt - b.claimedAt) // FIFO order

    if (cattleClaims.length < input.quantity) {
      throw new Error(
        `Cannot release ${input.quantity} anonymous claims. Only ${cattleClaims.length} exist. ` +
          `Use claimIds to release specific claims regardless of type.`
      )
    }

    claimsToRelease = cattleClaims.slice(0, input.quantity)
  } else if (input.externalId !== undefined) {
    // Release specific pet claim
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
    // Release multiple pet claims in a single query
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
      { subscriptionItemFeatureId: subscriptionItemFeature.id },
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

  // 5. Release the claims in bulk
  const releasedClaims = await bulkReleaseResourceClaims(
    claimsToRelease.map((c) => c.id),
    'released',
    transaction
  )

  // 6. Get updated usage
  const usage = await getResourceUsage(
    subscription.id,
    subscriptionItemFeature.id,
    transaction
  )

  return { releasedClaims, usage }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the resource usage for a subscription item feature.
 *
 * @param subscriptionId - The subscription ID
 * @param subscriptionItemFeatureId - The subscription item feature ID
 * @param transaction - The database transaction
 * @returns Object with capacity, claimed count, and available slots
 */
export async function getResourceUsage(
  subscriptionId: string,
  subscriptionItemFeatureId: string,
  transaction: DbTransaction
): Promise<{ capacity: number; claimed: number; available: number }> {
  // Get the subscription item feature to get capacity
  const [feature] = await selectSubscriptionItemFeatures(
    { id: subscriptionItemFeatureId },
    transaction
  )

  if (!feature || feature.type !== FeatureType.Resource) {
    throw new Error(
      `SubscriptionItemFeature ${subscriptionItemFeatureId} not found or is not a Resource type`
    )
  }

  const resourceFeature =
    feature as SubscriptionItemFeature.ResourceRecord
  const capacity = resourceFeature.amount

  // Count active claims
  const claimed = await countActiveClaimsForSubscriptionItemFeature(
    subscriptionItemFeatureId,
    transaction
  )

  return {
    capacity,
    claimed,
    available: capacity - claimed,
  }
}

/**
 * Validates that a subscription can be downgraded to a new capacity.
 *
 * @param subscriptionId - The subscription ID
 * @param subscriptionItemFeatureId - The subscription item feature ID
 * @param newCapacity - The proposed new capacity
 * @param transaction - The database transaction
 * @throws Error if active claims exceed the new capacity
 */
export async function validateResourceCapacityForDowngrade(
  subscriptionId: string,
  subscriptionItemFeatureId: string,
  newCapacity: number,
  transaction: DbTransaction
): Promise<void> {
  const { claimed } = await getResourceUsage(
    subscriptionId,
    subscriptionItemFeatureId,
    transaction
  )

  if (claimed > newCapacity) {
    // Get the feature to provide a better error message
    const [feature] = await selectSubscriptionItemFeatures(
      { id: subscriptionItemFeatureId },
      transaction
    )

    const resourceFeature =
      feature as SubscriptionItemFeature.ResourceRecord

    throw new Error(
      `Cannot reduce capacity to ${newCapacity}. ` +
        `${claimed} resources are currently claimed. ` +
        `Release ${claimed - newCapacity} claims before downgrading.`
    )
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
 * Alternative version that uses subscriptionItemFeature to find and release claims.
 * This can be used when you have a specific feature context.
 *
 * @param subscriptionItemFeatureId - The subscription item feature ID
 * @param reason - The reason for releasing
 * @param transaction - The database transaction
 * @returns Object with the count of released claims
 */
export async function releaseAllResourceClaimsForSubscriptionItemFeature(
  subscriptionItemFeatureId: string,
  reason: string,
  transaction: DbTransaction
): Promise<{ releasedCount: number }> {
  const activeClaims = await selectActiveResourceClaims(
    { subscriptionItemFeatureId },
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
