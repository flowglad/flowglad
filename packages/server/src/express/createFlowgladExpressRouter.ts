import { type Request, type RequestHandler, Router } from 'express'
import type { FlowgladServer } from '../FlowgladServer'
import type { RequestHandlerOptions } from '../requestHandler'
import { createExpressRouteHandler } from './createExpressRouteHandler'

export interface CreateFlowgladExpressRouterOptions
  extends Omit<RequestHandlerOptions, 'flowgladServer'> {
  flowgladServerConstructor: (
    req: Request
  ) => Promise<FlowgladServer> | FlowgladServer
  middleware?: RequestHandler[]
}

export const createFlowgladExpressRouter = (
  options: CreateFlowgladExpressRouterOptions
): Router => {
  const flowgladRouter = Router()
  const middleware = options.middleware || []
  const routeHandlerFromReq = async (req: Request) =>
    createExpressRouteHandler({
      ...options,
      flowgladServer: await options.flowgladServerConstructor(req),
    })

  flowgladRouter.get('*', ...middleware, async (req, res) => {
    const handler = await routeHandlerFromReq(req)
    handler(req, res)
  })

  flowgladRouter.post('*', ...middleware, async (req, res) => {
    const handler = await routeHandlerFromReq(req)
    handler(req, res)
  })

  return flowgladRouter as Router
}
