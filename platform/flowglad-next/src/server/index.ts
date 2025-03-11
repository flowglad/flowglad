import { router } from './trpc'
import { pong } from '@/server/mutations/pong'
import { createPurchase } from '@/server/mutations/createPurchase'
import { editPurchase } from '@/server/mutations/editPurchase'
import { createForm } from '@/server/mutations/createForm'
import { getRevenueData } from './queries/getRevenueData'
import { requestStripeConnectOnboardingLink } from '@/server/mutations/requestStripeConnectOnboardingLink'
import { initiateOAuthFlow } from '@/server/mutations/initiateOAuthFlow'
import { createOrganization } from '@/server/mutations/createOrganization'
import { editOrganization } from '@/server/mutations/editOrganization'
import { setPurchaseSessionCookie } from '@/server/mutations/setPurchaseSessionCookie'
import { editPurchaseSession } from '@/server/mutations/editPurchaseSession'
import { requestPurchaseAccessSession } from '@/server/mutations/requestPurchaseAccessSession'
import { confirmPurchaseSession } from '@/server/mutations/confirmPurchaseSession'
import { createFormSubmission } from '@/server/mutations/createFormSubmission'
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
import { variantsRouter } from './routers/variantsRouter'
import { purchaseSessionsRouter } from './routers/purchaseSessionsRouter'
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
  createSession: setPurchaseSessionCookie,
  updateSession: editPurchaseSession,
  confirmSession: confirmPurchaseSession,
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

const integrationsRouter = router({
  initiateOAuth: initiateOAuthFlow,
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
  purchaseSessions: purchaseSessionsRouter,
  products: productsRouter,
  variants: variantsRouter,
  purchases: purchasesRouter,
  customerProfiles: customerProfilesRouter,
  organizations: organizationsRouter,
  integrations: integrationsRouter,
  discounts: discountsRouter,
  files: filesRouter,
  links: linksRouter,
  // These could be moved into their own routers if they grow
  forms: router({
    create: createForm,
    createSubmission: createFormSubmission,
  }),
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
