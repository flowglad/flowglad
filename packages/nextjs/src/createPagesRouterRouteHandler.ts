import {
  type FlowgladServer,
  type RequestHandlerOptions,
  requestHandler,
} from '@flowglad/server'
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

export const createPagesRouterRouteHandler = (
  flowgladServer: FlowgladServer,
  options: Omit<
    RequestHandlerOptions<NextApiRequest>,
    'getCustomerExternalId' | 'flowglad'
  > = {}
) => {
  // Create a wrapper that uses requestHandler with a pre-constructed server
  // This is a legacy API - new code should use nextRouteHandler instead
  const handler = requestHandler({
    getCustomerExternalId: async () => {
      // Legacy API doesn't extract customer ID from request
      // This will fail at runtime if the server needs customer ID
      throw new Error(
        'Legacy API: FlowgladServer must be constructed with customerExternalId'
      )
    },
    flowglad: async () => flowgladServer,
    ...options,
  })

  return async (req: NextApiRequest, res: NextApiResponse) => {
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
  }
}
