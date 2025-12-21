import type { HTTPMethod } from '@flowglad/shared'
import type { Request, Response } from 'express'
import {
  createRequestHandler,
  type RequestHandlerOptions,
} from '../requestHandler'

export const createExpressRouteHandler = (
  options: RequestHandlerOptions
) => {
  const requestHandler = createRequestHandler(options)

  return async (req: Request, res: Response) => {
    const pathFragments = req.path
      .split('/')
      .filter((fragment) => fragment !== '')
    const result = await requestHandler({
      path: pathFragments,
      method: req.method as HTTPMethod,
      query:
        req.method === 'GET'
          ? (req.query as Record<string, string>)
          : undefined,
      body: req.method !== 'GET' ? req.body : undefined,
    })
    res.status(result.status).json({
      error: result.error,
      data: result.data,
    })
  }
}
