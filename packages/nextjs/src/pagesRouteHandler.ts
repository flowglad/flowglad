import { type FlowgladServer, requestHandler } from '@flowglad/server'
import type { HTTPMethod } from '@flowglad/shared'
import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Normalizes Next.js query parameters by:
 * 1. Converting array values to their first element (Next.js can provide array for repeated params)
 * 2. Removing undefined values
 * 3. Ensuring all values are strings
 *
 * @param query - The raw query object from Next.js request
 * @returns A normalized query object with single string values
 */
const normalizeQueryParameters = (query: NextApiRequest['query']) => {
  return Object.fromEntries(
    Object.entries(query)
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ])
      .filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
  )
}

/**
 * Options for creating a Next.js Pages Router API route handler with scoped FlowgladServer instances.
 */
export interface PagesRouteHandlerOptions {
  /**
   * Function to extract the customer external ID from the Next.js request.
   * The customerExternalId should be from YOUR app's database (e.g., user.id or organization.id),
   * NOT Flowglad's customer ID.
   *
   * @param req - The Next.js API request object
   * @returns The customer external ID from your app's database
   */
  getCustomerExternalId: (req: NextApiRequest) => Promise<string>
  /**
   * Function that creates a FlowgladServer instance for a specific customer.
   * @param customerExternalId - The customer's external ID
   * @returns A FlowgladServer instance scoped to that customer
   */
  flowglad: (
    customerExternalId: string
  ) => Promise<FlowgladServer> | FlowgladServer
  /**
   * Function to run when an error occurs.
   */
  onError?: (error: unknown) => void
  /**
   * Side effect to run before the request is processed.
   */
  beforeRequest?: () => Promise<void>
  /**
   * Side effect to run after the request is processed.
   */
  afterRequest?: () => Promise<void>
}

/**
 * Creates a Next.js Pages Router API route handler with per-request scoped FlowgladServer instances.
 *
 * This handler dynamically creates a FlowgladServer for each request based on the customer ID
 * extracted from the request. This pattern is useful when you want to scope billing operations
 * to a specific customer (either user or organization level, as defined in your flowglad server constructor)
 * without requiring full authentication setup in the constructor.
 *
 * @param options - Configuration options for the route handler
 * @returns A Next.js Pages Router API handler function
 *
 * @example
 * ```typescript
 * // In your lib/flowglad.ts
 * import { FlowgladServer } from '@flowglad/server'
 *
 * export const flowglad = (customerExternalId: string) => {
 *   return new FlowgladServer({
 *     customerExternalId,
 *     getCustomerDetails: async (externalId) => {
 *       const user = await db.users.findOne({ id: externalId })
 *       return {
 *         email: user.email,
 *         name: user.name,
 *       }
 *     },
 *   })
 * }
 *
 * // In your pages/api/flowglad/[...path].ts
 * import { pagesRouteHandler } from '@flowglad/nextjs/server'
 * import { flowglad } from '@/lib/flowglad'
 * import { verifyToken } from '@/lib/auth'
 *
 * export default pagesRouteHandler({
 *   getCustomerExternalId: async (req) => {
 *     const token = req.headers.authorization?.split(' ')[1]
 *     if (!token) throw new Error('Unauthorized')
 *     const decoded = await verifyToken(token)
 *     return decoded.userId
 *   },
 *   flowglad,
 * })
 * ```
 */
export const pagesRouteHandler = (
  options: PagesRouteHandlerOptions
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  const handler = requestHandler<NextApiRequest>(options)

  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const path = req.query.path as string[]
      const result = await handler(
        {
          path,
          method: req.method as HTTPMethod,
          query:
            req.method === 'GET'
              ? normalizeQueryParameters(req.query)
              : undefined,
          body: req.method !== 'GET' ? req.body : undefined,
        },
        req
      )

      res.status(result.status).json({
        error: result.error,
        data: result.data,
      })
    } catch (error) {
      options.onError?.(error)
      res.status(500).json({
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'Internal server error',
        },
        data: null,
      })
    }
  }
}
