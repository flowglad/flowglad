import type { HTTPMethod } from '@flowglad/shared'
import {
  type RequestHandlerOptions,
  requestHandler,
} from '../requestHandler'

/**
 * Options for creating a Supabase Edge Functions handler with scoped FlowgladServer instances.
 */
export interface SupabaseEdgeHandlerOptions
  extends RequestHandlerOptions<Request> {
  /**
   * Optional base path for explicit path extraction.
   * When provided, strips this prefix from the URL pathname before extracting the Flowglad action path.
   * More reliable than auto-detection for custom domains, proxies, or non-standard setups.
   * @example '/functions/v1/api-flowglad'
   */
  basePath?: string
}

/**
 * Extracts path segments from a pathname string.
 * @param pathname - The pathname to extract segments from
 * @returns An array of path segments
 */
const extractPath = (pathname: string): string[] => {
  const trimmedPath = pathname.replace(/^\/+|\/+$/g, '')
  return trimmedPath === '' ? [] : trimmedPath.split('/')
}

/**
 * Creates a Supabase Edge Functions handler for Flowglad API routes.
 *
 * This handler adapts the standard Web `Request` API (used by Deno and Supabase Edge Functions)
 * to the Flowglad request handler pattern.
 *
 * @param options - Configuration options including customer ID extraction and FlowgladServer factory
 * @returns A handler function that accepts a Request and returns a Promise<Response>
 *
 * @example
 * ```typescript
 * import { supabaseEdgeHandler } from '@flowglad/server/supabase'
 * import { FlowgladServer } from '@flowglad/server'
 *
 * const handler = supabaseEdgeHandler({
 *   basePath: '/functions/v1/api-flowglad',
 *   getCustomerExternalId: async (req) => {
 *     // Extract customer ID from request (e.g., from auth header)
 *     const authHeader = req.headers.get('Authorization')
 *     // ... validate and extract user ID
 *     return userId
 *   },
 *   flowglad: (customerExternalId) => new FlowgladServer({
 *     customerExternalId,
 *     getCustomerDetails: async (id) => ({
 *       name: 'Customer Name',
 *       email: 'customer@example.com',
 *     }),
 *   }),
 * })
 *
 * // In your Supabase Edge Function
 * Deno.serve(handler)
 * ```
 */
export const supabaseEdgeHandler = (
  options: SupabaseEdgeHandlerOptions
): ((req: Request) => Promise<Response>) => {
  const handler = requestHandler(options)

  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url)
      let pathSegments: string[] = []

      if (options.basePath) {
        // Explicit basePath provided - strip it from the pathname
        const basePathTrimmed = options.basePath.replace(
          /^\/+|\/+$/g,
          ''
        )
        const basePathWithSlash = `/${basePathTrimmed}`

        if (url.pathname.startsWith(basePathWithSlash)) {
          const relativePath = url.pathname.slice(
            basePathWithSlash.length
          )
          pathSegments = extractPath(relativePath)
        } else {
          // Cannot match basePath, fallback to using entire pathname
          pathSegments = extractPath(url.pathname)
        }
      } else {
        // Auto-detect: assume pattern /functions/v1/<function-name>/<rest>
        const segments = extractPath(url.pathname)
        if (
          segments.length >= 3 &&
          segments[0] === 'functions' &&
          segments[1] === 'v1'
        ) {
          // Skip 'functions', 'v1', and function name (3 segments)
          pathSegments = segments.slice(3)
        } else {
          // Fallback: treat entire pathname as path
          pathSegments = segments
        }
      }

      // Handle query params
      const queryParams = Array.from(url.searchParams.entries())
      const query =
        queryParams.length > 0
          ? Object.fromEntries(queryParams)
          : undefined

      // Handle body for non-GET requests
      let body: unknown = undefined
      if (req.method !== 'GET') {
        try {
          body = await req.json()
        } catch {
          // Ignore parse errors, leave body as undefined
        }
      }

      const result = await handler(
        {
          path: pathSegments,
          method: req.method as HTTPMethod,
          query,
          body,
        },
        req
      )

      const responseBody = JSON.stringify({
        data: result.data ?? null,
        error: result.error ?? null,
      })

      return new Response(responseBody, {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (err) {
      // Handle unexpected errors gracefully
      const errorMessage =
        err instanceof Error ? err.message : String(err)

      // Call onError if provided
      if (options.onError) {
        try {
          options.onError(err)
        } catch {
          // Ignore errors in onError callback
        }
      }

      return new Response(
        JSON.stringify({
          data: null,
          error: { message: errorMessage },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }
}
