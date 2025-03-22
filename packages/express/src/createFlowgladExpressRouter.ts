import {
  FlowgladServer,
  RequestHandlerOptions,
} from '@flowglad/server'
import { Application, Request, Router } from 'express'
import { createExpressRouteHandler } from './createFlowgladExpressRouteHandler'

interface CreateFlowgladExpressRouterOptions
  extends Omit<RequestHandlerOptions, 'flowgladServer'> {
  flowgladServerConstructor: (
    req: Request
  ) => Promise<FlowgladServer> | FlowgladServer
}

export const createFlowgladExpressRouter = (
  options: CreateFlowgladExpressRouterOptions
): Router => {
  const flowgladRouter = Router()
  const routeHandlerFromReq = async (req: Request) =>
    createExpressRouteHandler({
      ...options,
      flowgladServer: await options.flowgladServerConstructor(req),
    })

  flowgladRouter.get('*', async (req, res) => {
    const handler = await routeHandlerFromReq(req)
    handler(req, res)
  })

  flowgladRouter.post('*', async (req, res) => {
    const handler = await routeHandlerFromReq(req)
    handler(req, res)
  })

  return flowgladRouter as Router
}
