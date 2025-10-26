import { router } from './trpc'
import { pong } from '@/server/mutations/pong'
import { generateDescription } from '@/server/mutations/generateDescription'
import { getPresignedURL } from '@/server/mutations/getPresignedURL'
import { updateFile } from '@/server/mutations/editFile'
import { createLink } from '@/server/mutations/createLink'
import { updateLink } from '@/server/mutations/editLink'
import { deleteLinkProcedure } from '@/server/mutations/deleteLink'
import { deleteFileProcedure } from '@/server/mutations/deleteFile'
import { getProperNouns } from '@/server/queries/getProperNouns'
import { ping } from './queries/ping'
import { createFile } from './mutations/createFile'
import { rotateApiKeyProcedure } from './mutations/rotateApiKey'
import { toggleTestMode } from './mutations/toggleTestMode'
import { getApiKeys } from './queries/getApiKeys'
import { customersRouter } from './routers/customersRouter'
import { productsRouter } from './routers/productsRouter'
import { pricesRouter } from './routers/pricesRouter'
import { checkoutSessionsRouter } from './routers/checkoutSessionsRouter'
import { subscriptionsRouter } from './routers/subscriptionsRouter'
import { paymentsRouter } from './routers/paymentsRouter'
import { discountsRouter } from './routers/discountsRouter'
import { invoiceLineItemsRouter } from './routers/invoiceLineItemsRouter'
import { invoicesRouter } from './routers/invoicesRouter'
import { countriesRouter } from './routers/countriesRouter'
import { paymentMethodsRouter } from './routers/paymentMethodsRouter'
import { organizationsRouter } from './routers/organizationsRouter'
import { pricingModelsRouter } from './routers/pricingModelsRouter'
import { usageMetersRouter } from './routers/usageMetersRouter'
import { usageEventsRouter } from './routers/usageEventsRouter'
import { inviteUserToOrganization } from './mutations/inviteUserToOrganization'
import { apiKeysRouter } from './routers/apiKeysRouter'
import { purchasesRouter } from './routers/purchasesRouter'
import { webhooksRouter } from './routers/webhooksRouter'
import { featuresRouter } from './routers/featuresRouter'
import { productFeaturesRouter } from './routers/productFeaturesRouter'
import { subscriptionItemFeaturesRouter } from './routers/subscriptionItemFeaturesRouter'
import { customerBillingPortalRouter } from './routers/customerBillingPortalRouter'
import { logout } from './mutations/logout'
import { setReferralSelection } from './mutations/setReferralSelection'

const filesRouter = router({
  create: createFile,
  update: updateFile,
  delete: deleteFileProcedure,
})

const linksRouter = router({
  create: createLink,
  update: updateLink,
  delete: deleteLinkProcedure,
})

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
  files: filesRouter,
  links: linksRouter,
  invoiceLineItems: invoiceLineItemsRouter,
  invoices: invoicesRouter,
  countries: countriesRouter,
  pricingModels: pricingModelsRouter,
  // Utility endpoints
  utils: router({
    ping,
    pong,
    generateDescription,
    getProperNouns,
    getPresignedURL,
    toggleTestMode,
    inviteUserToOrganization,
    logout,
    setReferralSelection,
  }),
  apiKeys: apiKeysRouter,
  subscriptions: subscriptionsRouter,
  paymentMethods: paymentMethodsRouter,
  usageMeters: usageMetersRouter,
  usageEvents: usageEventsRouter,
  webhooks: webhooksRouter,
  features: featuresRouter,
  productFeatures: productFeaturesRouter,
  subscriptionItemFeatures: subscriptionItemFeaturesRouter,
  customerBillingPortal: customerBillingPortalRouter,
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
