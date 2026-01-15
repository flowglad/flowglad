'use client'
import {
  type ClaimResourceParams,
  FlowgladActionKey,
  type ReleaseResourceParams,
  type ResourceClaim,
  type ResourceUsage,
} from '@flowglad/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for resources caching */
export const RESOURCES_QUERY_KEY = 'flowglad-resources'

/** Query key for resource claims caching */
export const RESOURCE_CLAIMS_QUERY_KEY = 'flowglad-resource-claims'

/**
 * Mock resources data for dev mode.
 */
const mockResources: ResourceUsage[] = [
  {
    resourceSlug: 'seats',
    resourceId: 'res_mock_seats',
    capacity: 10,
    claimed: 3,
    available: 7,
  },
  {
    resourceSlug: 'api_keys',
    resourceId: 'res_mock_api_keys',
    capacity: 5,
    claimed: 2,
    available: 3,
  },
]

/**
 * Mock resource claim for dev mode.
 */
const createMockClaim = (
  resourceSlug: string,
  externalId: string | null = null
): ResourceClaim => ({
  id: `claim_mock_${Date.now()}`,
  subscriptionItemFeatureId: 'sif_mock',
  resourceId: `res_mock_${resourceSlug}`,
  subscriptionId: 'sub_mock',
  pricingModelId: 'pm_mock',
  externalId,
  claimedAt: Date.now(),
  releasedAt: null,
  releaseReason: null,
  metadata: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  livemode: false,
  organizationId: 'org_mock',
})

/**
 * Result type for the useResources hook.
 */
export interface UseResourcesResult {
  /** All resources with usage data. Undefined until loaded. */
  resources: ResourceUsage[] | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
  /**
   * Claim resources from subscription capacity.
   * Automatically invalidates the resources cache on success.
   *
   * Supports three mutually exclusive modes:
   * - `quantity`: Create N anonymous claims without external identifiers
   * - `externalId`: Create a named claim with a single external identifier (idempotent)
   * - `externalIds`: Create multiple named claims with external identifiers (idempotent)
   *
   * @param params.resourceSlug - The resource type to claim (e.g., 'seats', 'api_keys')
   * @param params.quantity - Anonymous claims mode: Number of resources to claim
   * @param params.externalId - Named claim mode: Single identifier for a named claim
   * @param params.externalIds - Named claims mode: Array of identifiers for multiple named claims
   * @param params.metadata - Optional key-value data to attach to claims
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   *
   * @returns Promise resolving to the created claims and updated usage
   *
   * @example
   * // Anonymous claims - claim 3 seats
   * await claim({ resourceSlug: 'seats', quantity: 3 })
   *
   * @example
   * // Named claim - assign seat to specific user (idempotent)
   * await claim({ resourceSlug: 'seats', externalId: 'user_123' })
   */
  claim: (params: ClaimResourceParams) => Promise<{
    claims: ResourceClaim[]
    usage: ResourceUsage
  }>
  /**
   * Release claimed resources back to the subscription's available pool.
   * Automatically invalidates the resources cache on success.
   *
   * Supports four mutually exclusive modes:
   * - `quantity`: Release N anonymous claims in FIFO order (oldest first)
   * - `externalId`: Release a named claim by its external identifier
   * - `externalIds`: Release multiple named claims by their external identifiers
   * - `claimIds`: Release specific claims by their database IDs
   *
   * @param params.resourceSlug - The resource type to release
   * @param params.quantity - Anonymous release mode: Number to release (FIFO)
   * @param params.externalId - Named release mode: Single identifier to release
   * @param params.externalIds - Named release mode: Array of identifiers to release
   * @param params.claimIds - Direct mode: Specific claim IDs to release
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   *
   * @returns Promise resolving to the released claims and updated usage
   *
   * @example
   * // Release 2 anonymous seats (FIFO)
   * await release({ resourceSlug: 'seats', quantity: 2 })
   *
   * @example
   * // Release a specific user's seat
   * await release({ resourceSlug: 'seats', externalId: 'user_123' })
   */
  release: (params: ReleaseResourceParams) => Promise<{
    releasedClaims: ResourceClaim[]
    usage: ResourceUsage
  }>
}

/**
 * Hook to access all resources for the current customer's subscription.
 *
 * Fetches resource usage on mount and provides claim/release mutations
 * that automatically invalidate the cache, keeping the UI in sync.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @returns Object containing resources array, loading state, error, and mutation functions
 *
 * @example
 * function TeamMembers() {
 *   const { resources, claim, release, isLoading } = useResources()
 *
 *   if (isLoading) return <Spinner />
 *
 *   const seats = resources?.find(r => r.resourceSlug === 'seats')
 *
 *   return (
 *     <div>
 *       <p>{seats?.claimed} / {seats?.capacity} seats used</p>
 *       <button
 *         onClick={() => claim({ resourceSlug: 'seats', quantity: 1 })}
 *         disabled={seats?.available === 0}
 *       >
 *         Add Seat
 *       </button>
 *     </div>
 *   )
 * }
 */
export const useResources = (): UseResourcesResult => {
  const { baseURL, betterAuthBasePath, requestConfig, __devMode } =
    useFlowgladConfig()
  const queryClient = useQueryClient()

  // Query for fetching resources
  const {
    data: resources,
    isLoading,
    error,
  } = useQuery<ResourceUsage[], Error>({
    queryKey: [RESOURCES_QUERY_KEY],
    queryFn: async () => {
      if (__devMode) {
        // Return mock data in dev mode without making network calls
        return mockResources
      }

      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetResources}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify({}),
        }
      )

      const json = await response.json()
      if (json.error) {
        throw new Error(
          json.error.json?.message ||
            json.error.message ||
            'Failed to fetch resources'
        )
      }

      return json.data.resources as ResourceUsage[]
    },
  })

  // Claim mutation
  const claimMutation = useMutation<
    { claims: ResourceClaim[]; usage: ResourceUsage },
    Error,
    ClaimResourceParams
  >({
    mutationFn: async (params) => {
      if (__devMode) {
        // Return mock data in dev mode
        const mockClaims: ResourceClaim[] = []
        const quantity = params.quantity ?? 1
        const externalIds =
          params.externalIds ??
          (params.externalId ? [params.externalId] : [])

        if (externalIds.length > 0) {
          for (const extId of externalIds) {
            mockClaims.push(
              createMockClaim(params.resourceSlug, extId)
            )
          }
        } else {
          for (let i = 0; i < quantity; i++) {
            mockClaims.push(
              createMockClaim(params.resourceSlug, null)
            )
          }
        }

        const mockResource =
          mockResources.find(
            (r) => r.resourceSlug === params.resourceSlug
          ) ?? mockResources[0]

        return {
          claims: mockClaims,
          usage: {
            ...mockResource,
            claimed: mockResource.claimed + mockClaims.length,
            available: mockResource.available - mockClaims.length,
          },
        }
      }

      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.ClaimResource}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params),
        }
      )

      const json = await response.json()
      if (json.error) {
        throw new Error(
          json.error.json?.message ||
            json.error.message ||
            'Failed to claim resource'
        )
      }

      return json.data as {
        claims: ResourceClaim[]
        usage: ResourceUsage
      }
    },
    onSuccess: () => {
      // Invalidate resources query to refetch and update UI
      queryClient.invalidateQueries({
        queryKey: [RESOURCES_QUERY_KEY],
      })
      // Also invalidate claims query if it exists
      queryClient.invalidateQueries({
        queryKey: [RESOURCE_CLAIMS_QUERY_KEY],
      })
    },
  })

  // Release mutation
  const releaseMutation = useMutation<
    { releasedClaims: ResourceClaim[]; usage: ResourceUsage },
    Error,
    ReleaseResourceParams
  >({
    mutationFn: async (params) => {
      if (__devMode) {
        // Return mock data in dev mode
        const mockReleasedClaims: ResourceClaim[] = []
        const quantity = params.quantity ?? 1
        const now = Date.now()

        for (let i = 0; i < quantity; i++) {
          mockReleasedClaims.push({
            ...createMockClaim(params.resourceSlug, null),
            claimedAt: now - 10000, // Claimed 10 seconds ago
            releasedAt: now,
          })
        }

        const mockResource =
          mockResources.find(
            (r) => r.resourceSlug === params.resourceSlug
          ) ?? mockResources[0]

        return {
          releasedClaims: mockReleasedClaims,
          usage: {
            ...mockResource,
            claimed: Math.max(
              0,
              mockResource.claimed - mockReleasedClaims.length
            ),
            available: Math.min(
              mockResource.capacity,
              mockResource.available + mockReleasedClaims.length
            ),
          },
        }
      }

      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.ReleaseResource}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params),
        }
      )

      const json = await response.json()
      if (json.error) {
        throw new Error(
          json.error.json?.message ||
            json.error.message ||
            'Failed to release resource'
        )
      }

      return json.data as {
        releasedClaims: ResourceClaim[]
        usage: ResourceUsage
      }
    },
    onSuccess: () => {
      // Invalidate resources query to refetch and update UI
      queryClient.invalidateQueries({
        queryKey: [RESOURCES_QUERY_KEY],
      })
      // Also invalidate claims query if it exists
      queryClient.invalidateQueries({
        queryKey: [RESOURCE_CLAIMS_QUERY_KEY],
      })
    },
  })

  return {
    resources,
    isLoading,
    error: error ?? null,
    claim: claimMutation.mutateAsync,
    release: releaseMutation.mutateAsync,
  }
}

/**
 * Result type for the useResource hook.
 */
export interface UseResourceResult {
  /** Usage for this specific resource. Undefined until loaded. */
  usage: ResourceUsage | undefined
  /**
   * Active claims for this resource.
   * Always an array (empty if no claims exist, never undefined).
   */
  claims: ResourceClaim[]
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Loading state for claims fetch */
  isLoadingClaims: boolean
  /** Error if fetch failed */
  error: Error | null
  /**
   * Claim this resource. The `resourceSlug` is automatically bound.
   *
   * Supports three mutually exclusive modes:
   * - `quantity`: Create N anonymous claims without external identifiers
   * - `externalId`: Create a named claim with a single external identifier (idempotent)
   * - `externalIds`: Create multiple named claims with external identifiers (idempotent)
   *
   * @param params.quantity - Anonymous claims mode: Number of resources to claim
   * @param params.externalId - Named claim mode: Single identifier for a named claim
   * @param params.externalIds - Named claims mode: Array of identifiers for multiple named claims
   * @param params.metadata - Optional key-value data to attach to claims
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   *
   * @returns Promise resolving to the created claims and updated usage
   *
   * @example
   * const { claim } = useResource('seats')
   *
   * // Anonymous claim
   * await claim({ quantity: 1 })
   *
   * // Named claim (idempotent)
   * await claim({ externalId: 'user_123' })
   */
  claim: (
    params: Omit<ClaimResourceParams, 'resourceSlug'>
  ) => Promise<{
    claims: ResourceClaim[]
    usage: ResourceUsage
  }>
  /**
   * Release this resource. The `resourceSlug` is automatically bound.
   *
   * Supports four mutually exclusive modes:
   * - `quantity`: Release N anonymous claims in FIFO order (oldest first)
   * - `externalId`: Release a named claim by its external identifier
   * - `externalIds`: Release multiple named claims by their external identifiers
   * - `claimIds`: Release specific claims by their database IDs
   *
   * @param params.quantity - Anonymous release mode: Number to release (FIFO)
   * @param params.externalId - Named release mode: Single identifier to release
   * @param params.externalIds - Named release mode: Array of identifiers to release
   * @param params.claimIds - Direct mode: Specific claim IDs to release
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   *
   * @returns Promise resolving to the released claims and updated usage
   *
   * @example
   * const { release } = useResource('seats')
   *
   * // Release anonymous claims (FIFO)
   * await release({ quantity: 2 })
   *
   * // Release by external ID
   * await release({ externalId: 'user_123' })
   */
  release: (
    params: Omit<ReleaseResourceParams, 'resourceSlug'>
  ) => Promise<{
    releasedClaims: ResourceClaim[]
    usage: ResourceUsage
  }>
}

/**
 * Hook to access a specific resource by slug.
 *
 * This is a convenience wrapper around `useResources()` that:
 * - Filters to the specific resource by slug
 * - Fetches claims for this specific resource
 * - Pre-binds `resourceSlug` to claim/release functions
 *
 * Both hooks share the same underlying query cache, so multiple
 * `useResource()` calls don't result in duplicate fetches.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param resourceSlug - The resource type to access (e.g., 'seats', 'api_keys')
 *
 * @returns Object containing resource usage, claims array, loading state, error, and mutation functions
 *
 * @example
 * function SeatManager() {
 *   const { usage, claims, claim, release, isLoading } = useResource('seats')
 *
 *   if (isLoading) return <Spinner />
 *
 *   return (
 *     <div>
 *       <p>{usage?.claimed} / {usage?.capacity} seats used</p>
 *
 *       <h3>Active Claims</h3>
 *       <ul>
 *         {claims.map(c => (
 *           <li key={c.id}>
 *             {c.externalId ?? 'Anonymous'} - claimed at {new Date(c.claimedAt).toLocaleString()}
 *             <button onClick={() => release({ claimIds: [c.id] })}>Release</button>
 *           </li>
 *         ))}
 *       </ul>
 *
 *       <button
 *         onClick={() => claim({ quantity: 1 })}
 *         disabled={usage?.available === 0}
 *       >
 *         Add Seat
 *       </button>
 *     </div>
 *   )
 * }
 *
 * @example
 * // Named claim - assign seat to specific user
 * function AssignSeat({ userId }: { userId: string }) {
 *   const { claim, claims } = useResource('seats')
 *
 *   // Check if user already has a seat
 *   const userHasSeat = claims.some(c => c.externalId === userId)
 *
 *   const handleAssign = async () => {
 *     // Named claims are idempotent - safe to call multiple times
 *     await claim({ externalId: userId, metadata: { assignedAt: Date.now() } })
 *   }
 *
 *   return (
 *     <button onClick={handleAssign} disabled={userHasSeat}>
 *       {userHasSeat ? 'Seat Assigned' : 'Assign Seat'}
 *     </button>
 *   )
 * }
 */
export const useResource = (
  resourceSlug: string
): UseResourceResult => {
  const { baseURL, betterAuthBasePath, requestConfig, __devMode } =
    useFlowgladConfig()
  const {
    resources,
    isLoading,
    error,
    claim: claimAll,
    release: releaseAll,
  } = useResources()

  // Query for fetching claims for this specific resource
  const {
    data: claims,
    isLoading: isLoadingClaims,
    error: claimsError,
  } = useQuery<ResourceClaim[], Error>({
    queryKey: [RESOURCE_CLAIMS_QUERY_KEY, resourceSlug],
    queryFn: async () => {
      if (__devMode) {
        // Return mock claims in dev mode
        return [
          createMockClaim(resourceSlug, 'user_mock_1'),
          createMockClaim(resourceSlug, null),
        ]
      }

      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.ListResourceClaims}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify({ resourceSlug }),
        }
      )

      const json = await response.json()
      if (json.error) {
        throw new Error(
          json.error.json?.message ||
            json.error.message ||
            'Failed to fetch resource claims'
        )
      }

      return json.data.claims as ResourceClaim[]
    },
  })

  // Find usage for this specific resource
  const usage = resources?.find(
    (r) => r.resourceSlug === resourceSlug
  )

  // Pre-bind resourceSlug to claim function
  const claim = async (
    params: Omit<ClaimResourceParams, 'resourceSlug'>
  ): Promise<{ claims: ResourceClaim[]; usage: ResourceUsage }> => {
    return claimAll({
      ...params,
      resourceSlug,
    } as ClaimResourceParams)
  }

  // Pre-bind resourceSlug to release function
  const release = async (
    params: Omit<ReleaseResourceParams, 'resourceSlug'>
  ): Promise<{
    releasedClaims: ResourceClaim[]
    usage: ResourceUsage
  }> => {
    return releaseAll({
      ...params,
      resourceSlug,
    } as ReleaseResourceParams)
  }

  // Combine errors
  const combinedError = error ?? claimsError ?? null

  return {
    usage,
    claims: claims ?? [], // Always return an array, never undefined
    isLoading,
    isLoadingClaims,
    error: combinedError,
    claim,
    release,
  }
}
