import {
  createRequestHandler,
  type FlowgladServer,
  type RequestHandlerOptions,
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
  options: Omit<RequestHandlerOptions, 'flowgladServer'> = {}
) => {
  const handler = createRequestHandler({ flowgladServer, ...options })

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const path = req.query.path as string[]
    const result = await handler({
      path,
      method: req.method as HTTPMethod,
      query:
        req.method === 'GET'
          ? normalizeQueryParameters(req.query)
          : undefined,
      body: req.method !== 'GET' ? req.body : undefined,
    })

    res.status(result.status).json({
      error: result.error,
      data: result.data,
    })
  }
}
