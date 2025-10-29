/**
 * Converts URLSearchParams to a plain object, handling duplicate keys by converting them to arrays.
 *
 * This function is essential for cursor pagination because it properly forwards query parameters
 * like `cursor` and `limit` from the URL to the tRPC backend.
 *
 * @example
 * // Single values
 * searchParamsToObject(new URLSearchParams('?cursor=abc123&limit=10'))
 * // Result: { cursor: 'abc123', limit: '10' }
 *
 * @example
 * // Duplicate keys (converted to arrays)
 * searchParamsToObject(new URLSearchParams('?filter=active&filter=pending&sort=name'))
 * // Result: { filter: ['active', 'pending'], sort: 'name' }
 *
 * @example
 * // Empty parameters
 * searchParamsToObject(new URLSearchParams(''))
 * // Result: {}
 *
 * @param searchParams - The URLSearchParams object from the request URL
 * @returns Object with string values for single occurrences, arrays for duplicates
 */
export const searchParamsToObject = (
  searchParams: URLSearchParams
): Record<string, string | string[]> => {
  const result: Record<string, string | string[]> = {}
  for (const [key, value] of searchParams.entries()) {
    const existing = result[key]
    if (existing === undefined) {
      result[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      result[key] = [existing, value]
    }
  }
  return result
}
