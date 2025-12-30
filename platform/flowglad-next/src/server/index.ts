import { generateDescription } from '@/server/mutations/generateDescription'
import { getPresignedURL } from '@/server/mutations/getPresignedURL'
import { pong } from '@/server/mutations/pong'
import { inviteUserToOrganization } from './mutations/inviteUserToOrganization'
import { logout } from './mutations/logout'
import { setReferralSelection } from './mutations/setReferralSelection'
import { toggleTestMode } from './mutations/toggleTestMode'
import { ping } from './queries/ping'
import { apiKeysRouter } from './routers/apiKeysRouter'
import { bannersRouter } from './routers/bannersRouter'
import { checkoutSessionsRouter } from './routers/checkoutSessionsRouter'
import { countriesRouter } from './routers/countriesRouter'
import { customerBillingPortalRouter } from './routers/customerBillingPortalRouter'
import { customersRouter } from './routers/customersRouter'
import { discountsRouter } from './routers/discountsRouter'
import { docsSearchRouter } from './routers/docsSearchRouter'
import { featuresRouter } from './routers/featuresRouter'
import { invoiceLineItemsRouter } from './routers/invoiceLineItemsRouter'
import { invoicesRouter } from './routers/invoicesRouter'
import { organizationsRouter } from './routers/organizationsRouter'
import { paymentMethodsRouter } from './routers/paymentMethodsRouter'
import { paymentsRouter } from './routers/paymentsRouter'
import { pricesRouter } from './routers/pricesRouter'
import { pricingModelsRouter } from './routers/pricingModelsRouter'
import { productFeaturesRouter } from './routers/productFeaturesRouter'
import { productsRouter } from './routers/productsRouter'
import { purchasesRouter } from './routers/purchasesRouter'
import { subscriptionItemFeaturesRouter } from './routers/subscriptionItemFeaturesRouter'
import { subscriptionsRouter } from './routers/subscriptionsRouter'
import { usageEventsRouter } from './routers/usageEventsRouter'
import { usageMetersRouter } from './routers/usageMetersRouter'
import { webhooksRouter } from './routers/webhooksRouter'
import { router } from './trpc'

// Main router with resource-based structure
export const appRouter = router({
  payments: paymentsRouter,
  checkoutSessions: checkoutSessionsRouter,
  products: productsRouter,
  prices: pricesRouter,
  purchases: purchasesRouter,
  customers: customersRouter,
  organizations: organizationsRouter,
  discounts: discountsRouter,
  invoiceLineItems: invoiceLineItemsRouter,
  invoices: invoicesRouter,
  countries: countriesRouter,
  pricingModels: pricingModelsRouter,
  // Utility endpoints
  utils: router({
    ping,
    pong,
    generateDescription,
    getPresignedURL,
    toggleTestMode,
    inviteUserToOrganization,
    logout,
    setReferralSelection,
  }),
  apiKeys: apiKeysRouter,
  banners: bannersRouter,
  subscriptions: subscriptionsRouter,
  paymentMethods: paymentMethodsRouter,
  usageMeters: usageMetersRouter,
  usageEvents: usageEventsRouter,
  webhooks: webhooksRouter,
  features: featuresRouter,
  productFeatures: productFeaturesRouter,
  subscriptionItemFeatures: subscriptionItemFeaturesRouter,
  customerBillingPortal: customerBillingPortalRouter,
  docsSearch: docsSearchRouter,
})

// This would map to REST endpoints like:
// GET    /api/v1/products
// POST   /api/v1/products
// PUT    /api/v1/products/:id
// GET    /api/v1/organizations/:id/revenue
// POST   /api/v1/purchases
// POST   /api/v1/purchases/sessions
// etc.

export type AppRouter = typeof appRouter
