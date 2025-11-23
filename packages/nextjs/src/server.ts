// We need to export server modules in a separate file from
// client modules because otherwise the consumer's next bundler
// will include client modules in server code
export { createAppRouterRouteHandler } from './createAppRouterRouteHandler'
export { createPagesRouterRouteHandler } from './createPagesRouterRouteHandler'
export {
  nextRouteHandler,
  type NextRouteHandlerOptions,
} from './nextRouteHandler'
export {
  FlowgladServer,
  FlowgladServerAdmin,
  createRequestHandler,
  RequestHandlerError,
  verifyWebhook,
  WebhookVerificationError,
  type RequestHandlerOptions,
  type RequestHandlerInput,
  type RequestHandlerOutput,
} from '@flowglad/server'

export {
  mcpHandlerWithFlowglad,
  toolWithFeatureAccessCheck,
  toolWithUsageBalanceCheck,
} from './withMCPToolAuthorization'
