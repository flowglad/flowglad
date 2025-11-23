import { routeToHandlerMap } from './subrouteHandlers'
import type { SubRouteHandler } from './subrouteHandlers/types'
import { FlowgladServer } from './FlowgladServer'
import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { NextRequest } from 'next/server'

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

export interface RequestHandlerOptions {
  flowgladServer: FlowgladServer
  /**
   * Function to run when an error occurs.
   * @param error - The error that occurred.
   */
  onError?: (error: unknown) => void
  /**
   * Side effect to run before the request is processed.
   * @returns A promise that resolves when the side effect is complete.
   */
  beforeRequest?: () => Promise<void>
  /**
   * Side effect to run after the request is processed.
   * @returns A promise that resolves when the side effect is complete.
   */
  afterRequest?: () => Promise<void>
}

/**
 * Options for creating a Next.js App Router route handler with scoped FlowgladServer instances.
 */
export interface NextRouteHandlerOptions {
  /**
   * Function to extract the customer external ID from the Next.js request.
   * @param req - The Next.js request object
   * @returns The customer external ID
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

export const createRequestHandler = (
  options: RequestHandlerOptions
) => {
  const { flowgladServer, onError, beforeRequest, afterRequest } =
    options

  return async (
    input: RequestHandlerInput
  ): Promise<RequestHandlerOutput> => {
    try {
      if (beforeRequest) {
        await beforeRequest()
      }

      const joinedPath = input.path.join('/') as FlowgladActionKey

      if (!Object.values(FlowgladActionKey).includes(joinedPath)) {
        throw new RequestHandlerError(
          `"${joinedPath}" is not a valid Flowglad API path`,
          404
        )
      }

      const handler = routeToHandlerMap[joinedPath]
      if (!handler) {
        throw new RequestHandlerError(
          `"${joinedPath}" is not a valid Flowglad API path`,
          404
        )
      }

      const data = input.method === 'GET' ? input.query : input.body

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
          status: (error as any).status,
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
