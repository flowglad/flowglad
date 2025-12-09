/**
 * Routes that allow empty request bodies.
 * These routes don't require a JSON body and will accept requests with no content.
 */
export const emptyBodyAllowedRoutes = [
  /^subscriptions\/[^/]+\/uncancel$/, // /subscriptions/{id}/uncancel
  /^product-features\/[^/]+\/expire$/, // /product-features/{id}/expire
]

/**
 * Check if a route path is whitelisted to allow empty request bodies
 */
export const isEmptyBodyAllowedForRoute = (path: string): boolean =>
  emptyBodyAllowedRoutes.some((pattern) => pattern.test(path))

/**
 * Check if request body is actually empty based on content-length header
 */
export const isRequestBodyEmpty = (
  contentLength: string | null
): boolean => !contentLength || contentLength === '0'

/**
 * Determine if empty body should be allowed for this request
 * Returns true only if BOTH conditions are met:
 * 1. Route is whitelisted to allow empty bodies
 * 2. Request body is actually empty (content-length is 0 or missing)
 */
export const shouldAllowEmptyBody = (
  path: string,
  contentLength: string | null
): boolean =>
  isEmptyBodyAllowedForRoute(path) &&
  isRequestBodyEmpty(contentLength)
