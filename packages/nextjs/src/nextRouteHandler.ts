import { type FlowgladServer, requestHandler } from '@flowglad/server'
import type { HTTPMethod } from '@flowglad/shared'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Options for creating a Next.js App Router route handler with scoped FlowgladServer instances.
 */
export interface NextRouteHandlerOptions {
  /**
   * Function to extract the customer external ID from the Next.js request.
   * The customerExternalId should be from YOUR app's database (e.g., user.id or organization.id),
   * NOT Flowglad's customer ID.
   *
   * @param req - The Next.js request object
   * @returns The customer external ID from your app's database
   */
  getCustomerExternalId: (req: NextRequest) => Promise<string>
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
  /**
   * Base URL for the Flowglad API.
   */
  baseURL?: string
}

type NextRouteHandler = (
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ path: string[] }> | { path: string[] } }
) => Promise<NextResponse>

/**
 * Creates a Next.js App Router route handler with per-request scoped FlowgladServer instances.
 *
 * This handler dynamically creates a FlowgladServer for each request based on the customer ID
 * extracted from the request. This pattern is useful when you want to scope billing operations
 * to a specific customer (either user or organization level, as defined in your flowglad server constructor)
 * without requiring full authentication setup in the constructor.
 *
 *
 * @param options - Configuration options for the route handler
 * @returns A Next.js App Router handler function
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
 * // In your app/api/flowglad/[...path]/route.ts
 * import { nextRouteHandler } from '@flowglad/nextjs'
 * import { flowglad } from '@/lib/flowglad'
 * import { verifyToken } from '@/lib/auth'
 *
 * export const { GET, POST } = nextRouteHandler({
 *   getCustomerExternalId: async (req) => {
 *     const token = req.headers.get('authorization')?.split(' ')[1]
 *     if (!token) throw new Error('Unauthorized')
 *     const decoded = await verifyToken(token)
 *     return decoded.userId
 *   },
 *   flowglad,
 * })
 *
 * ```
 *
 * For Pages Router, use `pagesRouteHandler` instead.
 */
export const nextRouteHandler = (
  options: NextRouteHandlerOptions
): {
  GET: NextRouteHandler
  POST: NextRouteHandler
} => {
  const {
    getCustomerExternalId,
    flowglad,
    onError,
    beforeRequest,
    afterRequest,
    baseURL,
  } = options

  const routeHandler = async (
    req: NextRequest,
    {
      params,
    }: { params: Promise<{ path: string[] }> | { path: string[] } }
  ): Promise<NextResponse> => {
    try {
      // Create request handler with customer ID extraction and FlowgladServer factory
      const handler = requestHandler({
        getCustomerExternalId,
        flowglad,
        onError,
        beforeRequest,
        afterRequest,
        baseURL,
      })

      // Support both Next 14 and 15
      // in Next.js 14 params is a plain object, in Next.js 15 params is a Promise (breaking change)
      const resolvedParams = 'then' in params ? await params : params
      const { path } = resolvedParams
      const result = await handler(
        {
          path,
          method: req.method as HTTPMethod,
          query:
            req.method === 'GET'
              ? Object.fromEntries(req.nextUrl.searchParams)
              : undefined,
          body:
            req.method !== 'GET'
              ? await req.json().catch(() => ({}))
              : undefined,
        },
        req
      )

      return NextResponse.json(
        {
          error: result.error,
          data: result.data,
        },
        {
          status: result.status,
        }
      )
    } catch (error) {
      if (onError) {
        onError(error)
      }
      return NextResponse.json(
        {
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Internal server error',
          },
          data: null,
        },
        { status: 500 }
      )
    }
  }
  return {
    GET: routeHandler,
    POST: routeHandler,
  }
}
