'use client'
import {
  type CustomerBillingDetails,
  type FeatureAccessItem,
  FlowgladActionKey,
  flowgladActionValidators,
  type GetFeatureAccessParams,
  type GetFeatureAccessResponse,
} from '@flowglad/shared'
import { useQuery } from '@tanstack/react-query'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'

/** Query key for features caching */
export const FEATURES_QUERY_KEY = 'flowglad-features'

type FeatureAccessRouteResponse =
  | {
      data?: GetFeatureAccessResponse | null
      error?: { code: string; json: Record<string, unknown> } | null
    }
  | undefined

/**
 * Result type for the useFeatures hook.
 */
export interface UseFeaturesResult {
  /** All feature access items. Undefined until loaded. */
  features: FeatureAccessItem[] | undefined
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Result type for the useFeature hook.
 */
export interface UseFeatureResult {
  /** Feature access item for the specific slug, or null if not found. */
  feature: FeatureAccessItem | null
  /** Whether the customer has access to this feature */
  hasAccess: boolean
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Derives feature access items from billingMocks data.
 * Extracts toggle features only from currentSubscriptions[].experimental.featureItems.
 */
const deriveFeaturesFromBillingMocks = (
  billingMocks: CustomerBillingDetails,
  params?: GetFeatureAccessParams
): FeatureAccessItem[] => {
  const currentSubscriptions = billingMocks.currentSubscriptions ?? []

  // Filter by subscriptionId if provided
  const subscriptions = params?.subscriptionId
    ? currentSubscriptions.filter(s => s.id === params.subscriptionId)
    : currentSubscriptions

  // Extract toggle features only, deduplicate by slug
  const featuresBySlug = new Map<string, FeatureAccessItem>()
  for (const sub of subscriptions) {
    const featureItems = sub.experimental?.featureItems ?? []
    for (const item of featureItems) {
      if (item.type === 'toggle' && !featuresBySlug.has(item.slug)) {
        featuresBySlug.set(item.slug, {
          id: item.id,
          livemode: item.livemode,
          slug: item.slug,
          name: item.name,
        })
      }
    }
  }

  return Array.from(featuresBySlug.values())
}

/**
 * Hook to access feature access items for the current customer's subscriptions.
 *
 * Fetches feature access data on mount. Can optionally filter by subscription ID.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param params - Optional parameters
 * @param params.subscriptionId - Filter features to a specific subscription
 *
 * @returns Object containing features array, loading state, and error
 *
 * @example
 * ```tsx
 * function FeatureDisplay() {
 *   const { features, isLoading, error } = useFeatures()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <div>
 *       {features?.map(feature => (
 *         <div key={feature.id}>
 *           {feature.name}
 *         </div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export const useFeatures = (
  params?: GetFeatureAccessParams
): UseFeaturesResult => {
  const {
    baseURL,
    betterAuthBasePath,
    requestConfig,
    __devMode,
    billingMocks,
  } = useFlowgladConfig()

  const {
    data: responseData,
    isLoading,
    error,
  } = useQuery<FeatureAccessRouteResponse, Error>({
    queryKey: [FEATURES_QUERY_KEY, params?.subscriptionId],
    enabled: !__devMode,
    queryFn: async () => {
      const flowgladRoute = getFlowgladRoute(
        baseURL,
        betterAuthBasePath
      )
      const response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.GetFeatureAccess}`,
        {
          method:
            flowgladActionValidators[
              FlowgladActionKey.GetFeatureAccess
            ].method,
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params ?? {}),
        }
      )

      const json = await response.json()
      return json as FeatureAccessRouteResponse
    },
  })

  // Dev mode: derive features from billingMocks
  if (__devMode) {
    if (!billingMocks) {
      throw new Error(
        'FlowgladProvider: __devMode requires billingMocks'
      )
    }
    const features = deriveFeaturesFromBillingMocks(billingMocks, params)

    return {
      features,
      isLoading: false,
      error: null,
    }
  }

  // Handle error responses from the API
  if (responseData?.error) {
    return {
      features: undefined,
      isLoading: false,
      error: new Error(
        responseData.error.json?.message?.toString() ??
          responseData.error.code ??
          'Failed to fetch feature access'
      ),
    }
  }

  return {
    features: responseData?.data?.features,
    isLoading,
    error: error ?? null,
  }
}

/**
 * Hook to access a specific feature by slug.
 *
 * This is a convenience wrapper around `useFeatures` that:
 * - Fetches all feature access items
 * - Filters to the specific feature by slug
 * - Returns hasAccess boolean (true if feature found)
 *
 * Uses the same query cache as `useFeatures`, preventing redundant API calls.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @param featureSlug - The slug of the feature to check access for
 * @param params - Optional parameters
 * @param params.subscriptionId - Filter to a specific subscription
 *
 * @returns Object containing the feature, hasAccess boolean, loading state, and error
 *
 * @example
 * ```tsx
 * function AdvancedAnalyticsGate() {
 *   const { hasAccess, isLoading, error } = useFeature('advanced-analytics')
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *   if (!hasAccess) return <UpgradePrompt />
 *
 *   return <AdvancedAnalyticsDashboard />
 * }
 * ```
 */
export const useFeature = (
  featureSlug: string,
  params?: GetFeatureAccessParams
): UseFeatureResult => {
  const { features, isLoading, error } = useFeatures(params)
  const feature = features?.find((f) => f.slug === featureSlug) ?? null
  return { feature, hasAccess: feature !== null, isLoading, error }
}
