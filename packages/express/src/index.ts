// Deprecation warning
if (typeof console !== 'undefined' && console.warn) {
  console.warn(
    '[@flowglad/express] This package is deprecated. Use @flowglad/server/express instead. ' +
      'See https://docs.flowglad.com/sdks/express for migration guide.'
  )
}

export {
  FlowgladServer,
  verifyWebhook,
  WebhookVerificationError,
} from '@flowglad/server'
export { createExpressRouteHandler } from './createFlowgladExpressRouteHandler'
export type { CreateFlowgladExpressRouterOptions } from './createFlowgladExpressRouter'
export { createFlowgladExpressRouter } from './createFlowgladExpressRouter'
