import { createFlowgladExpressRouter } from '@flowglad/express'
import { flowgladServer } from '../utils/flowglad'

export const flowgladRouter = createFlowgladExpressRouter({
  flowgladServerConstructor: flowgladServer,
})
