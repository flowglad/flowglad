import {
  FlowgladServer,
  RequestHandlerOptions,
} from '@flowglad/server'
import { Application, Request, Router } from 'express'
import { createExpressRouteHandler } from './createFlowgladExpressRouteHandler'

interface CreateFlowgladExpressRouterOptions
  extends Omit<RequestHandlerOptions, 'flowgladServer'> {
  flowgladServerConstructor: (req: Request) => FlowgladServer
}

export const createFlowgladExpressRouter = (
  options: CreateFlowgladExpressRouterOptions
): Router => {
  const flowgladRouter = Router()
  const routeHandlerFromReq = (req: Request) =>
    createExpressRouteHandler({
      ...options,
      flowgladServer: options.flowgladServerConstructor(req),
    })

  flowgladRouter.get('*', (req, res) => {
    const handler = routeHandlerFromReq(req)
    handler(req, res)
  })

  flowgladRouter.post('*', (req, res) => {
    const handler = routeHandlerFromReq(req)
    handler(req, res)
  })
  return flowgladRouter as Router
}
