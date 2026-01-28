import { addDays, subDays } from 'date-fns'
import {
  setupBillingPeriod,
  setupInvoice,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUserAndApiKey,
  setupUserAndCustomer,
} from '@/../seedDatabase'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import {
  BillingPeriodStatus,
  InvoiceStatus,
  SubscriptionStatus,
} from '@/types'

export interface SubscriptionTestData {
  organization: Organization.Record
  pricingModel: PricingModel.Record
  product: Product.Record
  price: Price.Record
  user: User.Record
  customer: Customer.Record
  paymentMethod: PaymentMethod.Record
  subscription: Subscription.Record
  billingPeriod: BillingPeriod.Record
  invoice: Invoice.Record
  apiKeyToken?: string
}

export interface SubscriptionTestSetupOptions {
  billingPeriodDays?: number
  subscriptionStatus?: SubscriptionStatus
  includeInvoice?: boolean
  includeApiKey?: boolean
  livemode?: boolean
}

export const setupSubscriptionTestData = async (
  options: SubscriptionTestSetupOptions = {}
): Promise<SubscriptionTestData> => {
  const {
    billingPeriodDays = 30,
    subscriptionStatus = SubscriptionStatus.Active,
    includeInvoice = true,
    includeApiKey = false,
    livemode = true,
  } = options

  // Setup organization and pricing
  const orgData = (await setupOrg()).unwrap()
  const organization = orgData.organization
  const pricingModel = orgData.pricingModel
  const product = orgData.product
  const price = orgData.price

  // Setup user and customer
  const userData = (
    await setupUserAndCustomer({
      organizationId: organization.id,
      livemode,
    })
  ).unwrap()
  const user = userData.user
  const customer = userData.customer

  // Setup payment method
  const paymentMethod = (
    await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode,
    })
  ).unwrap()

  // Setup subscription with billing period
  const now = new Date()
  // Calculate proper billing period: half before now, half after now
  // For odd periods, give the extra day to the future period
  const daysBefore = Math.floor(billingPeriodDays / 2)
  const daysAfter = Math.ceil(billingPeriodDays / 2)
  const billingPeriodStart = subDays(now, daysBefore).getTime()
  const billingPeriodEnd = addDays(now, daysAfter).getTime()

  const subscription = await setupSubscription({
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    paymentMethodId: paymentMethod.id,
    status: subscriptionStatus,
    currentBillingPeriodStart: billingPeriodStart,
    currentBillingPeriodEnd: billingPeriodEnd,
    renews: true,
    livemode,
  })

  // Setup billing period
  const billingPeriod = (
    await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: billingPeriodStart,
      endDate: billingPeriodEnd,
      status: BillingPeriodStatus.Active,
      livemode,
    })
  ).unwrap()

  // Setup invoice if requested
  let invoice: Invoice.Record
  if (includeInvoice) {
    invoice = (
      await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        billingPeriodId: billingPeriod.id,
        priceId: price.id,
        livemode,
        status: InvoiceStatus.Paid,
      })
    ).unwrap()
  } else {
    // Create a minimal invoice record for type compatibility
    invoice = {} as Invoice.Record
  }

  // Setup API key if requested
  let apiKeyToken: string | undefined
  if (includeApiKey) {
    const apiKeyData = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode,
      })
    ).unwrap()
    apiKeyToken = apiKeyData.apiKey.token!
  }

  return {
    organization,
    pricingModel,
    product,
    price,
    user,
    customer,
    paymentMethod,
    subscription,
    billingPeriod,
    invoice,
    apiKeyToken,
  }
}
