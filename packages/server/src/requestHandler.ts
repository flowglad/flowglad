import {
  type AuthenticatedActionKey,
  FlowgladActionKey,
  type HTTPMethod,
  type HybridActionKey,
} from '@flowglad/shared'
import type { FlowgladServer } from './FlowgladServer'
import { FlowgladServerAdmin } from './FlowgladServerAdmin'
import {
  hybridRouteToHandlerMap,
  isHybridActionKey,
  routeToHandlerMap,
} from './subrouteHandlers'
import type {
  HybridSubRouteHandler,
  SubRouteHandler,
} from './subrouteHandlers/types'

/**
 * Input for the request handler.
 */
export interface RequestHandlerInput {
  /**
   * The path of the request.
   * @example "/customers/123" => ["customers", "123"]
   */
  path: string[]
  /**
   * The method of the request.
   * @example "GET"
   */
  method: HTTPMethod
  /**
   * The parsed query parameters of the request.
   * @example { "name": "John", "age": "30" }
   */
  query?: Record<string, string>
  /**
   * The body of the request.
   * @example { "name": "John", "age": "30" }
   */
  body?: unknown
}

export interface RequestHandlerOutput {
  status: number
  data?: unknown
  error?: unknown
}

/**
 * Options for creating a request handler with per-request scoped FlowgladServer instances.
 *
 * This interface supports the customer ID extraction pattern where customer identification
 * and FlowgladServer construction are separated for better flexibility and testability.
 *
 * @typeParam TRequest - The framework-specific request type (e.g., Express Request, NextRequest)
 */
export interface RequestHandlerOptions<TRequest> {
  /**
   * Function to extract the customer external ID from the request.
   * The customerExternalId should be from YOUR app's database (e.g., user.id or organization.id),
   * NOT Flowglad's customer ID.
   *
   * @param req - The framework-specific request object
   * @returns The customer external ID from your app's database
   */
  getCustomerExternalId: (req: TRequest) => Promise<string>
  /**
   * Function that creates a FlowgladServer instance for a specific customer.
   * This function will be called for each request with the extracted customer ID.
   *
   * @param customerExternalId - The customer's external ID
   * @returns A FlowgladServer instance scoped to that customer
   */
  flowglad: (
    customerExternalId: string
  ) => Promise<FlowgladServer> | FlowgladServer
  /**
   * API key for hybrid routes (routes that work with or without authentication).
   * Required for hybrid routes. Falls back to process.env.FLOWGLAD_SECRET_KEY.
   */
  apiKey?: string
  /**
   * Base URL for the Flowglad API.
   */
  baseURL?: string
  /**
   * Function to run when an error occurs during request handling.
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

export class RequestHandlerError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message)
    this.name = 'RequestHandlerError'
  }
}

/**
 * Creates a request handler that extracts customer ID and creates scoped FlowgladServer instances.
 *
 * @typeParam TRequest - The framework-specific request type (e.g., Express Request, NextRequest)
 */
export const requestHandler = <TRequest = unknown>(
  options: RequestHandlerOptions<TRequest>
) => {
  const {
    getCustomerExternalId,
    flowglad,
    apiKey,
    baseURL,
    onError,
    beforeRequest,
    afterRequest,
  } = options

  return async (
    input: RequestHandlerInput,
    request: TRequest
  ): Promise<RequestHandlerOutput> => {
    try {
      if (beforeRequest) {
        await beforeRequest()
      }

      // Validate path BEFORE attempting auth - this allows hybrid routes to
      // return proper errors without auth throwing first
      const joinedPath = input.path.join('/') as FlowgladActionKey

      if (!Object.values(FlowgladActionKey).includes(joinedPath)) {
        throw new RequestHandlerError(
          `"${joinedPath}" is not a valid Flowglad API path`,
          404
        )
      }

      const data = input.method === 'GET' ? input.query : input.body

      // ═══════════════════════════════════════════════════════════════════════
      // HYBRID ROUTE HANDLING
      // Check if this is a hybrid route (auth optional, graceful fallback)
      // ═══════════════════════════════════════════════════════════════════════
      if (isHybridActionKey(joinedPath)) {
        const resolvedApiKey =
          apiKey || process.env.FLOWGLAD_SECRET_KEY
        if (!resolvedApiKey) {
          throw new RequestHandlerError(
            'API key required for this route. Provide apiKey option or set FLOWGLAD_SECRET_KEY environment variable.',
            500
          )
        }

        const flowgladServerAdmin = new FlowgladServerAdmin({
          apiKey: resolvedApiKey,
          baseURL,
        })

        // ─────────────────────────────────────────────────────────────────────
        // TRY/CATCH SCOPE: Only catches errors from auth layer
        // These errors indicate "user is not authenticated" - expected behavior
        // ─────────────────────────────────────────────────────────────────────
        let flowgladServer: FlowgladServer | null = null
        try {
          const customerExternalId =
            await getCustomerExternalId(request)
          flowgladServer = await flowglad(customerExternalId)
        } catch (authError) {
          // ✓ CAUGHT: Auth failed - this is EXPECTED for hybrid routes
          // flowgladServer remains null, handler will use default pricing path
          //
          // This catch block handles ALL errors from getCustomerExternalId and flowglad:
          // - No session/token present
          // - Invalid/expired session/token
          // - Database errors looking up user
          // - Any other auth-layer failure
          //
          // All of these result in the same behavior: treat as unauthenticated
        }

        const handler = hybridRouteToHandlerMap[joinedPath]
        const result = await (
          handler as HybridSubRouteHandler<typeof joinedPath>
        )(
          {
            method: input.method as any,
            data: data as any,
          },
          {
            flowgladServer,
            flowgladServerAdmin,
          }
        )

        if (afterRequest) {
          await afterRequest()
        }

        return {
          status: result.status,
          data: result.data,
          error: result.error,
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // AUTHENTICATED ROUTE HANDLING (existing behavior)
      // NO TRY/CATCH here - auth errors propagate and return appropriate status
      // ═══════════════════════════════════════════════════════════════════════
      const handler =
        routeToHandlerMap[joinedPath as AuthenticatedActionKey]
      if (!handler) {
        throw new RequestHandlerError(
          `"${joinedPath}" is not a valid Flowglad API path`,
          404
        )
      }

      const customerExternalId = await getCustomerExternalId(request)
      const flowgladServer = await flowglad(customerExternalId)

      // We need to use a type assertion here because TypeScript cannot narrow the type
      // of joinedPath to a specific FlowgladActionKey at compile time, even though
      // we've validated it at runtime
      const result = await (
        handler as SubRouteHandler<typeof joinedPath>
      )(
        {
          method: input.method as any,
          data: data as any,
        },
        flowgladServer
      )

      if (afterRequest) {
        await afterRequest()
      }

      return {
        status: result.status,
        data: result.data,
        error: result.error,
      }
    } catch (error) {
      if (onError) {
        onError(error)
      }

      if (error instanceof RequestHandlerError) {
        return {
          status: error.status,
          error: { message: error.message },
        }
      }
      if ((error as any).message) {
        return {
          status: (error as any).status ?? 500,
          error: { message: (error as any).message },
        }
      }
      return {
        status: 400,
        error: { message: 'Internal server error' },
      }
    }
  }
}
