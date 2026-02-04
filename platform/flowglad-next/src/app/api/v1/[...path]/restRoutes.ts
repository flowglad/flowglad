import { apiKeysRouteConfigs } from '@/server/routers/apiKeysRouter'
import { checkoutSessionsRouteConfigs } from '@/server/routers/checkoutSessionsRouter'
import {
  customerArchiveRouteConfig,
  customerBillingRouteConfig,
  customersRouteConfigs,
  customerUsageBalancesRouteConfig,
} from '@/server/routers/customersRouter'
import { discountsRouteConfigs } from '@/server/routers/discountsRouter'
import { featuresRouteConfigs } from '@/server/routers/featuresRouter'
import { invoiceLineItemsRouteConfigs } from '@/server/routers/invoiceLineItemsRouter'
import { invoicesRouteConfigs } from '@/server/routers/invoicesRouter'
import { paymentMethodsRouteConfigs } from '@/server/routers/paymentMethodsRouter'
import {
  paymentsRouteConfigs,
  refundPaymentRouteConfig,
} from '@/server/routers/paymentsRouter'
import { pricesRouteConfigs } from '@/server/routers/pricesRouter'
import {
  exportPricingModelRouteConfig,
  getDefaultPricingModelRouteConfig,
  pricingModelsRouteConfigs,
  setupPricingModelRouteConfig,
} from '@/server/routers/pricingModelsRouter'
import { productFeaturesRouteConfigs } from '@/server/routers/productFeaturesRouter'
import { productsRouteConfigs } from '@/server/routers/productsRouter'
import { purchasesRouteConfigs } from '@/server/routers/purchasesRouter'
import { resourceClaimsRouteConfigs } from '@/server/routers/resourceClaimsRouter'
import { resourcesRouteConfigs } from '@/server/routers/resourcesRouter'
import { subscriptionItemFeaturesRouteConfigs } from '@/server/routers/subscriptionItemFeaturesRouter'
import { subscriptionsRouteConfigs } from '@/server/routers/subscriptionsRouter'
import {
  usageEventsBulkRouteConfig,
  usageEventsRouteConfigs,
} from '@/server/routers/usageEventsRouter'
import { usageMetersRouteConfigs } from '@/server/routers/usageMetersRouter'
import { webhooksRouteConfigs } from '@/server/routers/webhooksRouter'
import { type RouteConfig, trpcToRest } from '@/utils/openapi'

const routeConfigs = [
  ...customersRouteConfigs,
  ...subscriptionsRouteConfigs,
  ...checkoutSessionsRouteConfigs,
  ...pricesRouteConfigs,
  ...invoicesRouteConfigs,
  ...invoiceLineItemsRouteConfigs,
  ...paymentMethodsRouteConfigs,
  ...paymentsRouteConfigs,
  ...purchasesRouteConfigs,
  ...pricingModelsRouteConfigs,
  ...usageMetersRouteConfigs,
  ...usageEventsRouteConfigs,
  ...webhooksRouteConfigs,
  ...featuresRouteConfigs,
  ...productFeaturesRouteConfigs,
  ...resourcesRouteConfigs,
  ...resourceClaimsRouteConfigs,
  ...apiKeysRouteConfigs,
  ...subscriptionItemFeaturesRouteConfigs,
]

const arrayRoutes: Record<string, RouteConfig> = routeConfigs.reduce(
  (acc, route) => {
    return { ...acc, ...route }
  },
  {} as Record<string, RouteConfig>
)

export const routes: Record<string, RouteConfig> = {
  ...getDefaultPricingModelRouteConfig,
  ...setupPricingModelRouteConfig,
  ...exportPricingModelRouteConfig,
  ...refundPaymentRouteConfig,
  ...customerArchiveRouteConfig,
  ...customerBillingRouteConfig,
  ...customerUsageBalancesRouteConfig,
  ...usageEventsBulkRouteConfig,
  ...discountsRouteConfigs,
  ...productsRouteConfigs,
  ...trpcToRest('utils.ping'),
  // note it's important to add the array routes last
  // because the more specific patterns above will match first,
  // so e.g. /pricing-models/default will not attempt to match to /pricing-models/:id => id="default"
  ...arrayRoutes,
} as const
