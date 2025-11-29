/**
 * Navigation Context Utilities
 *
 * Provides types and helpers for "smart breadcrumbs" that adapt based on
 * where the user navigated from. This enables contextual back-navigation
 * in detail pages.
 *
 * @example
 * // Building a URL with navigation context
 * const url = buildNavigationUrl('/store/features/feat_123', {
 *   from: 'subscription',
 *   refId: 'sub_456',
 *   refName: 'Subscription Details',
 * })
 * // Result: /store/features/feat_123?from=subscription&refId=sub_456&refName=Subscription%20Details
 */

/**
 * Valid source page types for navigation context
 */
export type NavigationSource =
  | 'subscription'
  | 'pricing-model'
  | 'customer'

/**
 * Represents the navigation context for smart breadcrumbs.
 * Used to provide contextual back-navigation in detail pages.
 */
export interface NavigationContext {
  /** The source page type the user came from */
  from: NavigationSource
  /** The ID of the referencing entity */
  refId: string
  /** Display name for the breadcrumb (avoids extra DB lookups) */
  refName?: string
}

/**
 * Valid navigation source values for type guards
 */
const VALID_SOURCES: readonly NavigationSource[] = [
  'subscription',
  'pricing-model',
  'customer',
] as const

/**
 * Type guard to check if a string is a valid NavigationSource
 */
function isValidNavigationSource(
  value: string
): value is NavigationSource {
  return VALID_SOURCES.includes(value as NavigationSource)
}

/**
 * Parses navigation context from URL search params.
 * Returns undefined if the params don't contain valid navigation context.
 *
 * @param searchParams - The search params object from the page
 * @returns NavigationContext or undefined if no valid context
 *
 * @example
 * // In a server component page.tsx:
 * const resolvedParams = await searchParams
 * const navContext = parseNavigationContext(resolvedParams)
 */
export function parseNavigationContext(
  searchParams: Record<string, string | string[] | undefined>
): NavigationContext | undefined {
  const from = searchParams.from
  const refId = searchParams.refId
  const refName = searchParams.refName

  // Extract string values (handle potential array values from Next.js)
  const fromValue = Array.isArray(from) ? from[0] : from
  const refIdValue = Array.isArray(refId) ? refId[0] : refId
  const refNameValue = Array.isArray(refName) ? refName[0] : refName

  // Both 'from' and 'refId' are required for valid context
  if (!fromValue || !refIdValue) {
    return undefined
  }

  // Validate the 'from' value
  if (!isValidNavigationSource(fromValue)) {
    return undefined
  }

  return {
    from: fromValue,
    refId: refIdValue,
    refName: refNameValue,
  }
}

/**
 * Builds a URL with navigation context search params.
 *
 * @param basePath - The target URL path (e.g., '/store/features/feat_123')
 * @param context - The navigation context to encode
 * @returns Full URL string with search params
 *
 * @example
 * const url = buildNavigationUrl('/store/features/feat_123', {
 *   from: 'subscription',
 *   refId: 'sub_456',
 *   refName: 'Subscription Details',
 * })
 */
export function buildNavigationUrl(
  basePath: string,
  context: NavigationContext
): string {
  const params = new URLSearchParams()

  params.set('from', context.from)
  params.set('refId', context.refId)

  if (context.refName) {
    params.set('refName', context.refName)
  }

  return `${basePath}?${params.toString()}`
}

