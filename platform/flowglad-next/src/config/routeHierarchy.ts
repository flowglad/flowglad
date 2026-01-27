/**
 * Route hierarchy configuration for context-aware navigation.
 *
 * When switching organizations or livemode, detail pages (pages with resource IDs)
 * will 404 if that resource doesn't exist in the new context. This config maps
 * detail page route prefixes to their parent list pages for automatic fallback.
 *
 * The key is the route prefix to match (with trailing slash for specificity).
 * The value is the parent route to navigate to when context changes.
 */
export const ROUTE_PARENTS: Record<string, string> = {
  // Standard detail pages with corresponding list pages
  '/customers/': '/customers',
  '/pricing-models/': '/pricing-models',

  // Finance detail pages
  '/finance/subscriptions/': '/finance/subscriptions',
  '/finance/discounts/': '/finance/discounts',
  '/finance/purchases/': '/finance/purchases',

  // Detail pages without their own list page - fall back to related parent
  '/products/': '/pricing-models',
  '/features/': '/pricing-models',
  '/usage-meters/': '/pricing-models',
}

/**
 * Returns the parent route for a given pathname, or null if the pathname
 * is not a detail page that needs redirection on context switch.
 */
export function getParentRoute(pathname: string): string | null {
  for (const [prefix, parent] of Object.entries(ROUTE_PARENTS)) {
    if (pathname.startsWith(prefix)) {
      return parent
    }
  }
  return null
}
