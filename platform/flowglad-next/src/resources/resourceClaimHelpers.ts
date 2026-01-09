import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ResourceClaim } from '@/db/schema/resourceClaims'
import { resourceClaims } from '@/db/schema/resourceClaims'
import type { Resource } from '@/db/schema/resources'
import {
  type SubscriptionItemFeature,
  subscriptionItemFeatures,
} from '@/db/schema/subscriptionItemFeatures'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import { subscriptions } from '@/db/schema/subscriptions'
import {
  bulkInsertResourceClaims,
  countActiveClaimsForSubscriptionItemFeature,
  insertResourceClaim,
  releaseResourceClaim,
  selectActiveClaimByExternalId,
  selectActiveResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
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
 * Resolves a subscription ID. If not provided, finds the first active subscription
 * for the customer (based on organization context).
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
    return subscription
  }

  // Find the first active subscription for the customer
  const subscriptionsResult = await selectSubscriptions(
    {
      customerId: params.customerId,
      organizationId: params.organizationId,
    },
    transaction
  )

  const activeSubscription = subscriptionsResult.find(
    (s) => !isSubscriptionInTerminalState(s.status)
  )

  if (!activeSubscription) {
    throw new Error(
      'No active subscription found. Please provide a subscriptionId.'
    )
  }

  return activeSubscription
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

  // Get all subscription item features for these subscription items
  const allFeatures: SubscriptionItemFeature.Record[] = []
  for (const itemId of subscriptionItemIds) {
    const features = await selectSubscriptionItemFeatures(
      { subscriptionItemId: itemId },
      transaction
    )
    allFeatures.push(...features)
  }

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

  // 4. Find the subscription item feature for this resource
  const subscriptionItemFeature =
    await findSubscriptionItemFeatureForResource(
      {
        subscriptionId: subscription.id,
        resourceId: resource.id,
      },
      transaction
    )

  const capacity = subscriptionItemFeature.amount

  // 5. Determine how many claims we need to create
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
      // Idempotent: return existing claim
      const usage = await getResourceUsage(
        subscription.id,
        subscriptionItemFeature.id,
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
    // Pet mode (multiple): check idempotency for each
    const existingClaims: ResourceClaim.Record[] = []
    const newExternalIds: string[] = []

    for (const externalId of input.externalIds) {
      const existing = await selectActiveClaimByExternalId(
        {
          resourceId: resource.id,
          subscriptionId: subscription.id,
          externalId,
        },
        transaction
      )

      if (existing) {
        existingClaims.push(existing)
      } else {
        newExternalIds.push(externalId)
      }
    }

    // Only create claims for new externalIds
    claimsToCreate = newExternalIds.map((externalId) => ({
      externalId,
      metadata: input.metadata ?? null,
    }))

    // If all claims already exist, return them
    if (claimsToCreate.length === 0) {
      const usage = await getResourceUsage(
        subscription.id,
        subscriptionItemFeature.id,
        transaction
      )
      return { claims: existingClaims, usage }
    }
  }

  // 6. Validate capacity
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

  // 7. Create the claims
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

  // 8. Get updated usage
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
        `Cannot release ${input.quantity} cattle claims. Only ${cattleClaims.length} anonymous claims exist. ` +
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
    // Release multiple pet claims
    for (const externalId of input.externalIds) {
      const claim = await selectActiveClaimByExternalId(
        {
          resourceId: resource.id,
          subscriptionId: subscription.id,
          externalId,
        },
        transaction
      )

      if (!claim) {
        throw new Error(
          `No active claim found with externalId "${externalId}"`
        )
      }

      claimsToRelease.push(claim)
    }
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

  // 5. Release the claims
  const releasedClaims: ResourceClaim.Record[] = []
  for (const claim of claimsToRelease) {
    const released = await releaseResourceClaim(
      { id: claim.id, releaseReason: 'released' },
      transaction
    )
    releasedClaims.push(released)
  }

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

  // Release each claim
  for (const claim of activeClaims) {
    await releaseResourceClaim(
      { id: claim.id, releaseReason: reason },
      transaction
    )
  }

  return { releasedCount: activeClaims.length }
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

  for (const claim of activeClaims) {
    await releaseResourceClaim(
      { id: claim.id, releaseReason: reason },
      transaction
    )
  }

  return { releasedCount: activeClaims.length }
}
