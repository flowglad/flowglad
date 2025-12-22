import type { HTTPMethod } from '@flowglad/shared'
import { type Request, type RequestHandler, Router } from 'express'
import {
  type RequestHandlerOptions,
  requestHandler,
} from '../requestHandler'

/**
 * Options for creating an Express router with scoped FlowgladServer instances.
 */
export interface ExpressRouterOptions
  extends RequestHandlerOptions<Request> {
  /**
   * Optional Express middleware to run before the Flowglad handler.
   */
  middleware?: RequestHandler[]
}

/**
 * Creates an Express router for Flowglad API routes.
 *
 * @param options - Configuration options including customer ID extraction and FlowgladServer factory
 * @returns An Express router configured for Flowglad routes
 */
export const expressRouter = (
  options: ExpressRouterOptions
): Router => {
  const router = Router()
  const handler = requestHandler(options)

  // Apply middleware if provided
  if (options.middleware) {
    router.use(...options.middleware)
  }

  // Handle all routes
  router.all('*', async (req, res) => {
    const pathFragments = req.path
      .split('/')
      .filter((fragment) => fragment !== '')

    const result = await handler(
      {
        path: pathFragments,
        method: req.method as HTTPMethod,
        query:
          req.method === 'GET'
            ? (req.query as Record<string, string>)
            : undefined,
        body: req.method !== 'GET' ? req.body : undefined,
      },
      req
    )

    res.status(result.status).json({
      error: result.error,
      data: result.data,
    })
  })

  return router
}
