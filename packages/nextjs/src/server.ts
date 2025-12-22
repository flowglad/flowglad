// We need to export server modules in a separate file from
// client modules because otherwise the consumer's next bundler
// will include client modules in server code

export {
  FlowgladServer,
  FlowgladServerAdmin,
  RequestHandlerError,
  type RequestHandlerInput,
  type RequestHandlerOptions,
  type RequestHandlerOutput,
  requestHandler,
  verifyWebhook,
  WebhookVerificationError,
} from '@flowglad/server'
export { createAppRouterRouteHandler } from './createAppRouterRouteHandler'
export { createPagesRouterRouteHandler } from './createPagesRouterRouteHandler'
export {
  type NextRouteHandlerOptions,
  nextRouteHandler,
} from './nextRouteHandler'

export {
  mcpHandlerWithFlowglad,
  toolWithFeatureAccessCheck,
  toolWithUsageBalanceCheck,
} from './withMCPToolAuthorization'
