import { router } from './trpc'
import { pong } from '@/server/mutations/pong'
import { createPurchase } from '@/server/mutations/createPurchase'
import { editPurchase } from '@/server/mutations/editPurchase'
import { getRevenueData } from './queries/getRevenueData'
import { requestStripeConnectOnboardingLink } from '@/server/mutations/requestStripeConnectOnboardingLink'
import { createOrganization } from '@/server/mutations/createOrganization'
import { editOrganization } from '@/server/mutations/editOrganization'
import { setCheckoutSessionCookie } from '@/server/mutations/setCheckoutSessionCookie'
import { editCheckoutSession } from '@/server/mutations/editCheckoutSession'
import { requestPurchaseAccessSession } from '@/server/mutations/requestPurchaseAccessSession'
import { confirmCheckoutSession } from '@/server/mutations/confirmCheckoutSession'
import { generateDescription } from '@/server/mutations/generateDescription'
import { getPresignedURL } from '@/server/mutations/getPresignedURL'
import { editFile } from '@/server/mutations/editFile'
import { createLink } from '@/server/mutations/createLink'
import { editLink } from '@/server/mutations/editLink'
import { deleteLinkProcedure } from '@/server/mutations/deleteLink'
import { deleteFileProcedure } from '@/server/mutations/deleteFile'
import { sendAIChat } from '@/server/mutations/sendAIChat'
import { getProperNouns } from '@/server/queries/getProperNouns'
import { ping } from './queries/ping'
import { getFocusedMembership } from './queries/getFocusedMembership'
import { createFile } from './mutations/createFile'
import { createApiKey } from './mutations/createApiKey'
import { rotateApiKeyProcedure } from './mutations/rotateApiKey'
import { toggleTestMode } from './mutations/toggleTestMode'
import { getApiKeys } from './queries/getApiKeys'
import { customerProfilesRouter } from './routers/customerProfilesRouter'
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
import { getMembers } from './queries/getMembers'

const purchasesRouter = router({
  create: createPurchase,
  update: editPurchase,
  // Purchase session management
  createSession: setCheckoutSessionCookie,
  updateSession: editCheckoutSession,
  confirmSession: confirmCheckoutSession,
  requestAccess: requestPurchaseAccessSession,
})

const organizationsRouter = router({
  create: createOrganization,
  update: editOrganization,
  requestStripeConnect: requestStripeConnectOnboardingLink,
  getMembers: getMembers,
  // Revenue is a sub-resource of organizations
  getRevenue: getRevenueData,
})
const filesRouter = router({
  create: createFile,
  update: editFile,
  delete: deleteFileProcedure,
})

const linksRouter = router({
  create: createLink,
  update: editLink,
  delete: deleteLinkProcedure,
})

// Main router with resource-based structure
export const appRouter = router({
  payments: paymentsRouter,
  checkoutSessions: checkoutSessionsRouter,
  products: productsRouter,
  prices: pricesRouter,
  purchases: purchasesRouter,
  customerProfiles: customerProfilesRouter,
  organizations: organizationsRouter,
  discounts: discountsRouter,
  files: filesRouter,
  links: linksRouter,
  invoiceLineItems: invoiceLineItemsRouter,
  invoices: invoicesRouter,
  countries: countriesRouter,
  // Utility endpoints
  utils: router({
    ping,
    pong,
    generateDescription,
    sendAIChat,
    getProperNouns,
    getFocusedMembership,
    getPresignedURL,
    toggleTestMode,
  }),
  apiKeys: router({
    get: getApiKeys,
    create: createApiKey,
    rotate: rotateApiKeyProcedure,
  }),
  subscriptions: subscriptionsRouter,
  paymentMethods: paymentMethodsRouter,
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
