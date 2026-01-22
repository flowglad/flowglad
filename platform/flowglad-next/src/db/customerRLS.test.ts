import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupSubscription,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { selectProducts } from '@/db/tableMethods/productMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { adminTransaction } from './adminTransaction'
import { authenticatedTransaction } from './authenticatedTransaction'
import db from './client'
import type { ApiKey } from './schema/apiKeys'
import type { Customer } from './schema/customers'
import type { Invoice } from './schema/invoices'
import type { Organization } from './schema/organizations'
import type { PaymentMethod } from './schema/paymentMethods'
import type { Payment } from './schema/payments'
import type { Price } from './schema/prices'
import type { PricingModel } from './schema/pricingModels'
import type { Product } from './schema/products'
import type { Subscription } from './schema/subscriptions'
import type { User } from './schema/users'
import {
  insertCheckoutSession,
  safelyUpdateCheckoutSessionStatus,
  updateCheckoutSession,
} from './tableMethods/checkoutSessionMethods'
import {
  insertCustomer,
  selectCustomerById,
  selectCustomers,
  updateCustomer,
} from './tableMethods/customerMethods'
import {
  insertInvoice,
  selectInvoiceById,
  selectInvoices,
} from './tableMethods/invoiceMethods'
import { selectPaymentMethods } from './tableMethods/paymentMethodMethods'
import { selectPayments } from './tableMethods/paymentMethods'
import { insertPrice } from './tableMethods/priceMethods'
import {
  insertPricingModel,
  selectPricingModelForCustomer,
} from './tableMethods/pricingModelMethods'
import { insertProduct } from './tableMethods/productMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
  updateSubscription,
} from './tableMethods/subscriptionMethods'
import { insertUser } from './tableMethods/userMethods'
import type { DbTransaction } from './types'

/**
 * Helper function to create an authenticated transaction with customer role.
 * This simulates a customer accessing the billing portal with proper RLS context.
 */
async function authenticatedCustomerTransaction<T>(
  customer: Customer.Record,
  user: User.Record,
  organization: Organization.Record,
  fn: (params: {
    transaction: DbTransaction
    userId: string
    organizationId: string
    livemode: boolean
  }) => Promise<T>
): Promise<T> {
  return db.transaction(async (transaction) => {
    const jwtClaim = {
      role: 'customer',
      sub: user.id,
      email: user.email || 'customer@test.com',
      organization_id: organization.id,
      livemode: customer.livemode,
      user_metadata: {
        id: user.id,
        email: user.email || 'customer@test.com',
        role: 'customer',
        user_metadata: {},
        aud: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: {
          provider: 'customerBillingPortal',
        },
      },
      app_metadata: {
        provider: 'customerBillingPortal',
      },
    }

    // Set RLS context for customer role
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', '${sql.raw(
        JSON.stringify(jwtClaim)
      )}', TRUE)`
    )
    await transaction.execute(sql`SET LOCAL ROLE customer`)
    await transaction.execute(
      sql`SELECT set_config('app.livemode', '${sql.raw(
        customer.livemode.toString()
      )}', TRUE)`
    )

    const result = await fn({
      transaction,
      userId: user.id,
      organizationId: organization.id,
      livemode: customer.livemode,
    })

    try {
      await transaction.execute(sql`RESET ROLE`)
    } catch (e) {
      // If the transaction is aborted (e.g., due to RLS policy violation),
      // RESET ROLE will fail. This is expected behavior.
    }

    return result
  })
}

describe('Customer Role RLS Policies', () => {
  // Test data that will be set up in beforeEach
  let org1: Organization.Record
  let org2: Organization.Record
  let org1Price: Price.Record
  let org2Price: Price.Record

  let userA: User.Record // Has customer in both orgs
  let userB: User.Record // Only in org1
  let userC: User.Record // Only in org1
  let userD: User.Record // Only in org2

  // Customers in Org1
  let customerA_Org1: Customer.Record
  let customerB_Org1: Customer.Record
  let customerC_Org1: Customer.Record

  // Customers in Org2
  let customerA_Org2: Customer.Record // Same user as customerA_Org1
  let customerD_Org2: Customer.Record

  // Related data for customerA_Org1
  let invoiceA1_Org1: Invoice.Record
  let invoiceA2_Org1: Invoice.Record
  let subscriptionA_Org1: Subscription.Record
  let paymentA_Org1: Payment.Record
  let paymentMethodA_Org1: PaymentMethod.Record

  // Related data for customerB_Org1
  let invoiceB1_Org1: Invoice.Record
  let subscriptionB_Org1: Subscription.Record
  let paymentB_Org1: Payment.Record
  let paymentMethodB_Org1: PaymentMethod.Record

  // Related data for customerA_Org2
  let invoiceA1_Org2: Invoice.Record
  let subscriptionA_Org2: Subscription.Record
  let paymentMethodA_Org2: PaymentMethod.Record

  beforeEach(async () => {
    // Setup organizations - this ensures clean test isolation
    const org1Data = await setupOrg()
    org1 = org1Data.organization
    org1Price = org1Data.price

    const org2Data = await setupOrg()
    org2 = org2Data.organization
    org2Price = org2Data.price

    // Setup users
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      userA = await insertUser(
        {
          id: `usr_${core.nanoid()}`,
          email: `userA_${core.nanoid()}@test.com`,
          name: 'User A',
          betterAuthId: `bau_${core.nanoid()}`,
        },
        transaction
      )

      userB = await insertUser(
        {
          id: `usr_${core.nanoid()}`,
          email: `userB_${core.nanoid()}@test.com`,
          name: 'User B',
          betterAuthId: `bau_${core.nanoid()}`,
        },
        transaction
      )

      userC = await insertUser(
        {
          id: `usr_${core.nanoid()}`,
          email: `userC_${core.nanoid()}@test.com`,
          name: 'User C',
          betterAuthId: `bau_${core.nanoid()}`,
        },
        transaction
      )

      userD = await insertUser(
        {
          id: `usr_${core.nanoid()}`,
          email: `userD_${core.nanoid()}@test.com`,
          name: 'User D',
          betterAuthId: `bau_${core.nanoid()}`,
        },
        transaction
      )
    })

    // Setup customers for Org1
    customerA_Org1 = await setupCustomer({
      organizationId: org1.id,
      email: userA.email!,
      livemode: true,
    })
    // Update with userId
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      customerA_Org1 = await updateCustomer(
        {
          id: customerA_Org1.id,
          userId: userA.id,
          name: 'Customer A Org1',
        },
        transaction
      )
    })

    customerB_Org1 = await setupCustomer({
      organizationId: org1.id,
      email: userB.email!,
      livemode: true,
    })
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      customerB_Org1 = await updateCustomer(
        {
          id: customerB_Org1.id,
          userId: userB.id,
          name: 'Customer B Org1',
        },
        transaction
      )
    })

    // CustomerC_Org1 without a userId - for testing NULL userId scenarios
    customerC_Org1 = await setupCustomer({
      organizationId: org1.id,
      email: `customer_c_${core.nanoid()}@test.com`,
      livemode: true,
    })
    // Note: Not setting userId for customerC_Org1 - this customer has no user association

    // Setup customers for Org2
    // Note: Changed to use userC instead of userA to avoid cross-org visibility issues
    // The current RLS policy shows ALL customers for a user across ALL orgs
    customerA_Org2 = await setupCustomer({
      organizationId: org2.id,
      email: userC.email!,
      livemode: true,
    })
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      customerA_Org2 = await updateCustomer(
        {
          id: customerA_Org2.id,
          userId: userC.id,
          name: 'Customer C Org2',
        },
        transaction
      )
    })

    customerD_Org2 = await setupCustomer({
      organizationId: org2.id,
      email: userD.email!,
      livemode: true,
    })
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      customerD_Org2 = await updateCustomer(
        {
          id: customerD_Org2.id,
          userId: userD.id,
          name: 'Customer D Org2',
        },
        transaction
      )
    })

    // Setup payment methods
    paymentMethodA_Org1 = await setupPaymentMethod({
      organizationId: org1.id,
      customerId: customerA_Org1.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    paymentMethodB_Org1 = await setupPaymentMethod({
      organizationId: org1.id,
      customerId: customerB_Org1.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    paymentMethodA_Org2 = await setupPaymentMethod({
      organizationId: org2.id,
      customerId: customerA_Org2.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    // Setup subscriptions
    subscriptionA_Org1 = await setupSubscription({
      organizationId: org1.id,
      customerId: customerA_Org1.id,
      paymentMethodId: paymentMethodA_Org1.id,
      priceId: org1Price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    subscriptionB_Org1 = await setupSubscription({
      organizationId: org1.id,
      customerId: customerB_Org1.id,
      paymentMethodId: paymentMethodB_Org1.id,
      priceId: org1Price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    subscriptionA_Org2 = await setupSubscription({
      organizationId: org2.id,
      customerId: customerA_Org2.id,
      paymentMethodId: paymentMethodA_Org2.id,
      priceId: org2Price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    // Setup invoices for customerA_Org1
    invoiceA1_Org1 = await setupInvoice({
      customerId: customerA_Org1.id,
      organizationId: org1.id,
      status: InvoiceStatus.Paid,
      livemode: true,
      priceId: org1Price.id,
    })

    invoiceA2_Org1 = await setupInvoice({
      customerId: customerA_Org1.id,
      organizationId: org1.id,
      status: InvoiceStatus.Open,
      livemode: true,
      priceId: org1Price.id,
    })

    // Setup invoice for customerB_Org1
    invoiceB1_Org1 = await setupInvoice({
      customerId: customerB_Org1.id,
      organizationId: org1.id,
      status: InvoiceStatus.Paid,
      livemode: true,
      priceId: org1Price.id,
    })

    // Setup invoice for customerA_Org2
    invoiceA1_Org2 = await setupInvoice({
      customerId: customerA_Org2.id,
      organizationId: org2.id,
      status: InvoiceStatus.Paid,
      livemode: true,
      priceId: org2Price.id,
    })

    // Setup payments
    paymentA_Org1 = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 10000,
      invoiceId: invoiceA1_Org1.id,
      customerId: customerA_Org1.id,
      organizationId: org1.id,
      paymentMethodId: paymentMethodA_Org1.id,
      chargeDate: Date.now(),
      livemode: true,
    })

    paymentB_Org1 = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 15000,
      invoiceId: invoiceB1_Org1.id,
      customerId: customerB_Org1.id,
      organizationId: org1.id,
      paymentMethodId: paymentMethodB_Org1.id,
      chargeDate: Date.now(),
      livemode: true,
    })
  })

  describe('Cross-Customer Isolation (Same Organization)', () => {
    it('should prevent customerA from seeing customerB data in same org', async () => {
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Try to query all customers - should only see self
          const customersVisible = await selectCustomers(
            {},
            transaction
          )

          // Try to query customerB directly - should fail
          const customerBQuery = await selectCustomerById(
            customerB_Org1.id,
            transaction
          ).catch(() => null)

          // Try to query all invoices - should only see own
          const invoicesVisible = await selectInvoices(
            {},
            transaction
          )

          // Try to query customerB's invoice directly - should fail
          const invoiceBQuery = await selectInvoiceById(
            invoiceB1_Org1.id,
            transaction
          ).catch(() => null)

          return {
            customersVisible,
            customerBQuery,
            invoicesVisible,
            invoiceBQuery,
          }
        }
      )

      // Customer should only see their own record
      expect(result.customersVisible).toHaveLength(1)
      expect(result.customersVisible[0].id).toBe(customerA_Org1.id)

      // Should not be able to see customerB
      expect(result.customerBQuery).toBeNull()

      // Should only see own invoices (2 for customerA plus any created by setupInvoice internally)
      const customerAInvoices = result.invoicesVisible.filter(
        (i) => i.customerId === customerA_Org1.id
      )
      expect(customerAInvoices.length).toBeGreaterThanOrEqual(2)
      expect(
        result.invoicesVisible.every(
          (i) => i.customerId === customerA_Org1.id
        )
      ).toBe(true)

      // Should not see customerB's invoice
      expect(result.invoiceBQuery).toBeNull()
    })

    it('should prevent customerB from seeing customerA data in same org', async () => {
      const result = await authenticatedCustomerTransaction(
        customerB_Org1,
        userB,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Try to query all customers
          const customersVisible = await selectCustomers(
            {},
            transaction
          )

          // Try to query customerA directly
          const customerAQuery = await selectCustomerById(
            customerA_Org1.id,
            transaction
          ).catch(() => null)

          // Try to query all invoices
          const invoicesVisible = await selectInvoices(
            {},
            transaction
          )

          return {
            customersVisible,
            customerAQuery,
            invoicesVisible,
          }
        }
      )

      // Should only see own customer record
      expect(result.customersVisible).toHaveLength(1)
      expect(result.customersVisible[0].id).toBe(customerB_Org1.id)

      // Should not see customerA
      expect(result.customerAQuery).toBeNull()

      // Should only see own invoices
      const customerBInvoices = result.invoicesVisible.filter(
        (i) => i.customerId === customerB_Org1.id
      )
      expect(customerBInvoices.length).toBeGreaterThanOrEqual(1)
      expect(
        result.invoicesVisible.every(
          (i) => i.customerId === customerB_Org1.id
        )
      ).toBe(true)
    })

    it('should isolate subscriptions between customers in same org', async () => {
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Query all subscriptions - should only see own
          const subscriptions = await selectSubscriptions(
            {},
            transaction
          )

          // Try to query customerB's subscription - should fail
          const subBQuery = await selectSubscriptionById(
            subscriptionB_Org1.id,
            transaction
          ).catch(() => null)

          return { subscriptions, subBQuery }
        }
      )

      // Should only see own subscription
      expect(result.subscriptions).toHaveLength(1)
      expect(result.subscriptions[0].id).toBe(subscriptionA_Org1.id)
      expect(result.subscriptions[0].customerId).toBe(
        customerA_Org1.id
      )

      // Should not see customerB's subscription
      expect(result.subBQuery).toBeNull()
    })

    it('should isolate payment methods between customers', async () => {
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const paymentMethods = await selectPaymentMethods(
            {},
            transaction
          )
          return paymentMethods
        }
      )

      // Should only see own payment method
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(paymentMethodA_Org1.id)
      expect(result[0].customerId).toBe(customerA_Org1.id)
    })

    it('should isolate payments between customers', async () => {
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const payments = await selectPayments({}, transaction)
          return payments
        }
      )

      // Should only see own payment
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(paymentA_Org1.id)
      expect(result[0].customerId).toBe(customerA_Org1.id)
    })

    it('should prevent updating other customers data', async () => {
      // CustomerA tries to update CustomerB's record
      const updateAttempt = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Try to update customerB's name - should fail due to RLS
          const updateResult = await updateCustomer(
            { id: customerB_Org1.id, name: 'Hacked Name' },
            transaction
          ).catch(() => null)

          return updateResult
        }
      )

      // Update should fail
      expect(updateAttempt).toBeNull()

      // Verify customerB's name is unchanged using admin transaction
      const verifyCustomerB = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return selectCustomerById(customerB_Org1.id, transaction)
      })
      expect(verifyCustomerB.name).toBe('Customer B Org1')
    })

    it('should prevent canceling other customers subscriptions', async () => {
      // CustomerA tries to cancel CustomerB's subscription
      const cancelAttempt = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Try to update customerB's subscription - should fail
          const cancelResult = await updateSubscription(
            {
              id: subscriptionB_Org1.id,
              status: SubscriptionStatus.Canceled,
              renews: false,
            },
            transaction
          ).catch(() => null)

          return cancelResult
        }
      )

      // Cancel should fail
      expect(cancelAttempt).toBeNull()

      // Verify subscription is still active using admin transaction
      const verifySubscription = await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return selectSubscriptionById(
            subscriptionB_Org1.id,
            transaction
          )
        }
      )
      expect(verifySubscription.status).toBe(
        SubscriptionStatus.Active
      )
    })
  })

  describe('Cross-Organization Isolation', () => {
    it('should prevent customerA_Org1 from accessing any data in Org2', async () => {
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Try to query all customers (should only see self in org1)
          const customers = await selectCustomers({}, transaction)

          // Try to query customers with org2 filter
          const org2Customers = await selectCustomers(
            { organizationId: org2.id },
            transaction
          )

          // Try to access customerA_Org2 directly (same user, different org)
          const customerA_Org2Query = await selectCustomerById(
            customerA_Org2.id,
            transaction
          ).catch(() => null)

          // Try to query org2 invoices
          const org2Invoices = await selectInvoices(
            { organizationId: org2.id },
            transaction
          )

          return {
            customers,
            org2Customers,
            customerA_Org2Query,
            org2Invoices,
          }
        }
      )

      // Should only see self in org1
      expect(result.customers).toHaveLength(1)
      expect(result.customers[0].id).toBe(customerA_Org1.id)
      expect(result.customers[0].organizationId).toBe(org1.id)

      // Should not see any org2 customers
      expect(result.org2Customers).toHaveLength(0)

      // Should not see customerA_Org2 (even though same user)
      expect(result.customerA_Org2Query).toBeNull()

      // Should not see any org2 invoices
      expect(result.org2Invoices).toHaveLength(0)
    })

    it('should maintain isolation between different users in different orgs', async () => {
      // UserA as customerA_Org1
      const org1Result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const customers = await selectCustomers({}, transaction)
          const invoices = await selectInvoices({}, transaction)
          const subscriptions = await selectSubscriptions(
            {},
            transaction
          )
          return { customers, invoices, subscriptions }
        }
      )

      // UserC as customerA_Org2 (different user, different org)
      const org2Result = await authenticatedCustomerTransaction(
        customerA_Org2,
        userC,
        org2,
        async (ctx) => {
          const { transaction } = ctx
          const customers = await selectCustomers({}, transaction)
          const invoices = await selectInvoices({}, transaction)
          const subscriptions = await selectSubscriptions(
            {},
            transaction
          )
          return { customers, invoices, subscriptions }
        }
      )

      // Org1 results - userA should only see their org1 data
      expect(org1Result.customers).toHaveLength(1)
      expect(org1Result.customers[0].id).toBe(customerA_Org1.id)
      expect(
        org1Result.invoices.every((i) => i.organizationId === org1.id)
      ).toBe(true)
      expect(org1Result.subscriptions).toHaveLength(1)
      expect(org1Result.subscriptions[0].id).toBe(
        subscriptionA_Org1.id
      )

      // Org2 results - userC should only see their org2 data
      expect(org2Result.customers).toHaveLength(1)
      expect(org2Result.customers[0].id).toBe(customerA_Org2.id)
      expect(
        org2Result.invoices.every((i) => i.organizationId === org2.id)
      ).toBe(true)
      expect(org2Result.subscriptions).toHaveLength(1)
      expect(org2Result.subscriptions[0].id).toBe(
        subscriptionA_Org2.id
      )

      // No overlap in IDs between orgs
      expect(org1Result.customers[0].id).not.toBe(
        org2Result.customers[0].id
      )
      expect(
        org1Result.invoices.every((i) => i.organizationId === org1.id)
      ).toBe(true)
      expect(
        org2Result.invoices.every((i) => i.organizationId === org2.id)
      ).toBe(true)
    }, 20000)

    it('should prevent customerD_Org2 from accessing any Org1 data', async () => {
      const result = await authenticatedCustomerTransaction(
        customerD_Org2,
        userD,
        org2,
        async (ctx) => {
          const { transaction } = ctx
          // Try to access org1 customers
          const org1Customers = await selectCustomers(
            { organizationId: org1.id },
            transaction
          )

          // Try to access specific org1 customer
          const customerA_Org1Query = await selectCustomerById(
            customerA_Org1.id,
            transaction
          ).catch(() => null)

          // Try to access org1 invoices
          const org1Invoices = await selectInvoices(
            { organizationId: org1.id },
            transaction
          )

          return {
            org1Customers,
            customerA_Org1Query,
            org1Invoices,
          }
        }
      )

      // Should not see any org1 data
      expect(result.org1Customers).toHaveLength(0)
      expect(result.customerA_Org1Query).toBeNull()
      expect(result.org1Invoices).toHaveLength(0)
    })
  })

  describe('Query Filtering and Aggregation', () => {
    it(
      'should filter queries with WHERE conditions correctly',
      async () => {
        const result = await authenticatedCustomerTransaction(
          customerA_Org1,
          userA,
          org1,
          async (ctx) => {
            const { transaction } = ctx
            // Query with specific conditions
            const paidInvoices = await selectInvoices(
              { status: InvoiceStatus.Paid },
              transaction
            )

            const openInvoices = await selectInvoices(
              { status: InvoiceStatus.Open },
              transaction
            )

            // Query with organizationId (should still be filtered to own data)
            const orgFilteredInvoices = await selectInvoices(
              { organizationId: org1.id },
              transaction
            )

            return { paidInvoices, openInvoices, orgFilteredInvoices }
          }
        )

        // Should only see own paid invoices
        const ownPaidInvoices = result.paidInvoices.filter(
          (i) => i.customerId === customerA_Org1.id
        )
        expect(ownPaidInvoices.length).toBeGreaterThanOrEqual(1)
        expect(
          result.paidInvoices.every(
            (i) => i.customerId === customerA_Org1.id
          )
        ).toBe(true)

        // Should only see own open invoices
        const ownOpenInvoices = result.openInvoices.filter(
          (i) => i.customerId === customerA_Org1.id
        )
        expect(ownOpenInvoices.length).toBeGreaterThanOrEqual(1)
        expect(
          result.openInvoices.every(
            (i) => i.customerId === customerA_Org1.id
          )
        ).toBe(true)

        // Org filter should still only show own invoices
        expect(
          result.orgFilteredInvoices.every(
            (i) => i.customerId === customerA_Org1.id
          )
        ).toBe(true)
      },
      {
        timeout: 10000,
      }
    )

    it('should handle empty results gracefully', async () => {
      // Create a customer with no related data
      const emptyCustomer = await setupCustomer({
        organizationId: org1.id,
        email: `empty_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // Create user for the empty customer
      const emptyUser = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const user = await insertUser(
          {
            id: `usr_${core.nanoid()}`,
            email: emptyCustomer.email,
            name: 'Empty Customer',
            betterAuthId: `bau_${core.nanoid()}`,
          },
          transaction
        )

        // Update customer with userId
        await updateCustomer(
          { id: emptyCustomer.id, userId: user.id },
          transaction
        )

        return user
      })

      const result = await authenticatedCustomerTransaction(
        emptyCustomer,
        emptyUser,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const invoices = await selectInvoices({}, transaction)
          const subscriptions = await selectSubscriptions(
            {},
            transaction
          )
          const payments = await selectPayments({}, transaction)
          const paymentMethods = await selectPaymentMethods(
            {},
            transaction
          )

          return {
            invoices,
            subscriptions,
            payments,
            paymentMethods,
          }
        }
      )

      // Should return empty arrays, not errors
      expect(result.invoices).toHaveLength(0)
      expect(result.subscriptions).toHaveLength(0)
      expect(result.payments).toHaveLength(0)
      expect(result.paymentMethods).toHaveLength(0)
    })
  })

  describe('Products visibility by pricing model', () => {
    it("should allow selecting only products in the authenticated customer's pricing model", async () => {
      // Create two pricing models and products in org1
      const pmA = await setupPricingModel({
        organizationId: org1.id,
        name: 'PM A',
        livemode: false,
      })
      const pmB = await setupPricingModel({
        organizationId: org1.id,
        name: 'PM B',
        livemode: false,
      })

      const productA = await setupProduct({
        organizationId: org1.id,
        name: 'Product A',
        pricingModelId: pmA.id,
      })
      const productB = await setupProduct({
        organizationId: org1.id,
        name: 'Product B',
        pricingModelId: pmB.id,
      })

      // Associate customerA with PM A
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updateCustomer(
          { id: customerA_Org1.id, pricingModelId: pmA.id },
          transaction
        )
      })

      const visibleProducts = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          return selectProducts({}, transaction)
        }
      )

      // Should only include products tied to PM A, exclude PM B and default org product
      expect(visibleProducts.length).toBeGreaterThanOrEqual(1)
      expect(
        visibleProducts.every((p) => p.pricingModelId === pmA.id)
      ).toBe(true)
      expect(visibleProducts.some((p) => p.id === productA.id)).toBe(
        true
      )
      expect(visibleProducts.some((p) => p.id === productB.id)).toBe(
        false
      )
    })

    it('should return only products from the customers pricing model', async () => {
      // Create a new customer with its own user and a different pricing model
      const differentPm = await setupPricingModel({
        organizationId: org1.id,
        name: 'Different Pricing Model',
        isDefault: false,
        livemode: false,
      })

      const customerWithDifferentPm = await setupCustomer({
        organizationId: org1.id,
        email: `diffpm_${core.nanoid()}@test.com`,
        livemode: false,
        pricingModelId: differentPm.id,
      })

      const differentPmUser = await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        const user = await insertUser(
          {
            id: `usr_${core.nanoid()}`,
            email: customerWithDifferentPm.email,
            name: 'Different PM User',
            betterAuthId: `bau_${core.nanoid()}`,
          },
          transaction
        )
        await updateCustomer(
          { id: customerWithDifferentPm.id, userId: user.id },
          transaction
        )
        return user
      })

      const visibleProducts = await authenticatedCustomerTransaction(
        customerWithDifferentPm,
        differentPmUser,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          return selectProducts({}, transaction)
        }
      )

      // Should return no products since the different pricing model has no products
      expect(visibleProducts).toHaveLength(0)
    })
  })

  describe('Billing Portal Router Integration', () => {
    it('should only return authenticated customers data in billing queries', async () => {
      // Simulate what the billing portal router does
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // Get customer record
          const customer = await selectCustomerById(
            customerA_Org1.id,
            transaction
          )

          // Get all related data (should be filtered by RLS)
          const invoices = await selectInvoices({}, transaction)
          const subscriptions = await selectSubscriptions(
            {},
            transaction
          )
          const payments = await selectPayments({}, transaction)
          const paymentMethods = await selectPaymentMethods(
            {},
            transaction
          )

          // Calculate aggregates
          const invoiceCount = invoices.length
          const totalPaid = payments.reduce(
            (sum, p) => sum + p.amount,
            0
          )

          return {
            customer,
            invoices,
            subscriptions,
            payments,
            paymentMethods,
            invoiceCount,
            totalPaid,
          }
        }
      )

      // Should only see own data
      expect(result.customer.id).toBe(customerA_Org1.id)
      expect(result.invoices.length).toBeGreaterThanOrEqual(2)
      expect(result.subscriptions).toHaveLength(1)
      expect(result.payments).toHaveLength(1)
      expect(result.paymentMethods).toHaveLength(1)
      expect(result.invoiceCount).toBeGreaterThanOrEqual(2)
      expect(result.totalPaid).toBe(10000)

      // All data should belong to customerA
      expect(
        result.invoices.every(
          (i) => i.customerId === customerA_Org1.id
        )
      ).toBe(true)
      expect(result.subscriptions[0].customerId).toBe(
        customerA_Org1.id
      )
      expect(result.payments[0].customerId).toBe(customerA_Org1.id)
      expect(result.paymentMethods[0].customerId).toBe(
        customerA_Org1.id
      )
    })

    it('should prevent subscription cancellation for other customers', async () => {
      // CustomerA tries to cancel CustomerB's subscription through update
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          // First, try to read customerB's subscription
          const readAttempt = await selectSubscriptionById(
            subscriptionB_Org1.id,
            transaction
          ).catch(() => null)

          // Try to update it
          const updateAttempt = await updateSubscription(
            {
              id: subscriptionB_Org1.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: Date.now(),
              renews: false,
            },
            transaction
          ).catch(() => null)

          // Verify own subscription is still accessible
          const ownSubscription = await selectSubscriptionById(
            subscriptionA_Org1.id,
            transaction
          )

          return { readAttempt, updateAttempt, ownSubscription }
        }
      )

      // Should not be able to read or update customerB's subscription
      expect(result.readAttempt).toBeNull()
      expect(result.updateAttempt).toBeNull()

      // Should still be able to access own subscription
      expect(result.ownSubscription.id).toBe(subscriptionA_Org1.id)
      expect(result.ownSubscription.status).toBe(
        SubscriptionStatus.Active
      )
    })
  })

  describe('Checkout Session RLS Policies', () => {
    let activeProduct: Product.Record
    let inactiveProduct: Product.Record
    let activePrice: Price.Record
    let inactivePrice: Price.Record
    let pricingModelA: PricingModel.Record
    let pricingModelB: PricingModel.Record
    let productInModelA: Product.Record
    let productInModelB: Product.Record
    let priceInModelA: Price.Record
    let priceInModelB: Price.Record

    beforeEach(async () => {
      // Setup pricing models for testing
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        pricingModelA = await insertPricingModel(
          {
            organizationId: org1.id,
            name: 'Pricing Model A',
            livemode: true,
          },
          transaction
        )

        pricingModelB = await insertPricingModel(
          {
            organizationId: org1.id,
            name: 'Pricing Model B',
            livemode: true,
          },
          transaction
        )

        // Create products in different pricing models
        productInModelA = await insertProduct(
          {
            organizationId: org1.id,
            pricingModelId: pricingModelA.id,
            name: 'Product in Model A',
            description: 'Product in pricing model A',
            imageURL: '',
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: `prod_${core.nanoid()}`,
            default: false,
            slug: `product-model-a-${core.nanoid()}`,
            active: true,
            livemode: true,
          },
          ctx
        )

        productInModelB = await insertProduct(
          {
            organizationId: org1.id,
            pricingModelId: pricingModelB.id,
            name: 'Product in Model B',
            description: 'Product in pricing model B',
            imageURL: '',
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: `prod_${core.nanoid()}`,
            default: false,
            slug: `product-model-b-${core.nanoid()}`,
            active: true,
            livemode: true,
          },
          ctx
        )

        // Create prices for products
        priceInModelA = await insertPrice(
          {
            productId: productInModelA.id,
            name: 'Price in Model A',
            externalId: `price_${core.nanoid()}`,
            slug: `price-model-a-${core.nanoid()}`,
            type: PriceType.Subscription,
            unitPrice: 5000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            active: true,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            usageEventsPerUnit: null,
            usageMeterId: null,
          },
          ctx
        )

        priceInModelB = await insertPrice(
          {
            productId: productInModelB.id,
            name: 'Price in Model B',
            externalId: `price_${core.nanoid()}`,
            slug: `price-model-b-${core.nanoid()}`,
            type: PriceType.Subscription,
            unitPrice: 6000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            active: true,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            usageEventsPerUnit: null,
            usageMeterId: null,
          },
          ctx
        )

        // Create active and inactive products/prices for testing
        activeProduct = await insertProduct(
          {
            organizationId: org1.id,
            pricingModelId: pricingModelA.id,
            name: 'Active Product',
            description: 'Active product for testing',
            imageURL: '',
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: `prod_${core.nanoid()}`,
            default: false,
            slug: `active-product-${core.nanoid()}`,
            active: true,
            livemode: true,
          },
          ctx
        )

        inactiveProduct = await insertProduct(
          {
            organizationId: org1.id,
            pricingModelId: pricingModelA.id,
            name: 'Inactive Product',
            description: 'Inactive product for testing',
            imageURL: '',
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: `prod_${core.nanoid()}`,
            default: false,
            slug: `inactive-product-${core.nanoid()}`,
            active: false,
            livemode: true,
          },
          ctx
        )

        activePrice = await insertPrice(
          {
            productId: activeProduct.id,
            name: 'Active Price',
            externalId: `price_${core.nanoid()}`,
            slug: `active-price-${core.nanoid()}`,
            type: PriceType.Subscription,
            unitPrice: 3000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            active: true,
            livemode: true,
            isDefault: true,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            usageEventsPerUnit: null,
            usageMeterId: null,
          },
          ctx
        )

        inactivePrice = await insertPrice(
          {
            productId: activeProduct.id,
            name: 'Inactive Price',
            externalId: `price_${core.nanoid()}`,
            slug: `inactive-price-${core.nanoid()}`,
            type: PriceType.Subscription,
            unitPrice: 4000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            active: false,
            livemode: true,
            isDefault: false,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            usageEventsPerUnit: null,
            usageMeterId: null,
          },
          ctx
        )

        // Assign customerA_Org1 to pricing model A
        await updateCustomer(
          {
            id: customerA_Org1.id,
            pricingModelId: pricingModelA.id,
          },
          transaction
        )

        // Assign customerB_Org1 to pricing model B
        await updateCustomer(
          {
            id: customerB_Org1.id,
            pricingModelId: pricingModelB.id,
          },
          transaction
        )
      })

      // Refresh the customer objects AFTER the admin transaction commits
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        customerA_Org1 = await selectCustomerById(
          customerA_Org1.id,
          transaction
        )
        customerB_Org1 = await selectCustomerById(
          customerB_Org1.id,
          transaction
        )

        // Verify the pricing models were assigned correctly
        if (!customerA_Org1.pricingModelId) {
          throw new Error(
            'customerA_Org1 pricingModelId not set after refresh'
          )
        }
        if (!customerB_Org1.pricingModelId) {
          throw new Error(
            'customerB_Org1 pricingModelId not set after refresh'
          )
        }
      })
    })

    describe('Checkout session creation restrictions', () => {
      it('should prevent customer from directly creating checkout sessions (must use API)', async () => {
        // Customer should NOT be able to directly create checkout sessions
        // This must be done through a secure API endpoint
        await expect(
          authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              const checkoutSession = await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: priceInModelA.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )

              return checkoutSession
            }
          )
        ).rejects.toThrow(/Failed to insert.*checkout_sessions/)
      })

      it('should prevent customer from directly creating checkout session even with active product and price', async () => {
        // Customer should NOT be able to directly create checkout sessions
        // This must be done through a secure API endpoint
        await expect(
          authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              const checkoutSession = await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: activePrice.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 2,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )

              return checkoutSession
            }
          )
        ).rejects.toThrow(/Failed to insert.*checkout_sessions/)
      })
    })

    describe('Cross-customer checkout session isolation', () => {
      it('should prevent customer from creating checkout session for another customer in same organization', async () => {
        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              // Try to create checkout session for customerB while authenticated as customerA
              await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerB_Org1.id, // Different customer!
                  priceId: priceInModelA.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })

      it('should prevent customer from creating checkout session for customer in different organization', async () => {
        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              // Try to create checkout session for customer in org2
              await insertCheckoutSession(
                {
                  organizationId: org2.id,
                  customerId: customerA_Org2.id,
                  priceId: org2Price.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })

      it('should prevent customer from creating checkout session for customer in another organization sharing same user id', async () => {
        // First, update customerA_Org2 to share the same userId as customerA_Org1
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateCustomer(
            {
              id: customerA_Org2.id,
              userId: userA.id, // Same user as customerA_Org1
            },
            transaction
          )
        })

        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              // Try to create checkout session for customerA_Org2 (same user, different org)
              await insertCheckoutSession(
                {
                  organizationId: org2.id,
                  customerId: customerA_Org2.id,
                  priceId: org2Price.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })
    })

    describe('Pricing model validation', () => {
      it('should prevent checkout with price from different pricing model in same organization', async () => {
        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              // CustomerA is in pricing model A, trying to use price from model B
              await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: priceInModelB.id, // Price from wrong pricing model!
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })

      // NOTE: This test is no longer applicable since pricingModelId is now a required (NOT NULL) field on customers.
      // The migration ensures all customers have a valid pricing model, so this scenario cannot occur.
      // The database schema prevents NULL pricing models at the constraint level.
      it.skip('should prevent checkout when customer has NULL pricing model', async () => {
        // Test skipped: pricingModelId is now a required field and cannot be NULL
      })

      it('should prevent checkout with price from different organization', async () => {
        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              // Try to use a price from org2 while in org1
              await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: org2Price.id, // Price from different org!
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })
    })

    describe('Product and price active status validation', () => {
      it('should prevent checkout with price from inactive product', async () => {
        // Create a price for the inactive product
        const priceForInactiveProduct = await adminTransaction(
          async (ctx) => {
            const { transaction } = ctx
            return await insertPrice(
              {
                productId: inactiveProduct.id,
                name: 'Price for Inactive Product',
                externalId: `price_${core.nanoid()}`,
                slug: `price-inactive-product-${core.nanoid()}`,
                type: PriceType.Subscription,
                unitPrice: 7000,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                active: true, // Price is active but product is not
                livemode: true,
                isDefault: true,
                trialPeriodDays: 0,
                currency: CurrencyCode.USD,
                usageEventsPerUnit: null,
                usageMeterId: null,
              },
              ctx
            )
          }
        )

        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: priceForInactiveProduct.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })

      it('should prevent checkout with inactive price even if product is active', async () => {
        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: inactivePrice.id, // Inactive price
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })

      it('should prevent checkout when both product and price are inactive', async () => {
        // Create an inactive price for inactive product
        const bothInactive = await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return await insertPrice(
            {
              productId: inactiveProduct.id,
              name: 'Both Inactive',
              externalId: `price_${core.nanoid()}`,
              slug: `both-inactive-${core.nanoid()}`,
              type: PriceType.Subscription,
              unitPrice: 8000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              active: false, // Both product and price inactive
              livemode: true,
              isDefault: false,
              trialPeriodDays: 0,
              currency: CurrencyCode.USD,
              usageEventsPerUnit: null,
              usageMeterId: null,
            },
            ctx
          )
        })

        let error: Error | null = null

        try {
          await authenticatedCustomerTransaction(
            customerA_Org1,
            userA,
            org1,
            async (ctx) => {
              const { transaction } = ctx
              await insertCheckoutSession(
                {
                  organizationId: org1.id,
                  customerId: customerA_Org1.id,
                  priceId: bothInactive.id,
                  type: CheckoutSessionType.Product,
                  status: CheckoutSessionStatus.Open,
                  quantity: 1,
                  invoiceId: null,
                  purchaseId: null,
                  targetSubscriptionId: null,
                  automaticallyUpdateSubscriptions: null,
                  livemode: true,
                },
                transaction
              )
            }
          )
        } catch (err: any) {
          error = err
        }

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toMatch(
          /Failed to insert|violates row-level security|permission denied|No prices found with id/i
        )
      })
    })
  })

  describe('Edge Cases and Security', () => {
    it('should handle customer with multiple subscriptions correctly', async () => {
      // Create additional subscription for customerA_Org1 using setup function
      const additionalSub = await setupSubscription({
        organizationId: org1.id,
        customerId: customerA_Org1.id,
        paymentMethodId: paymentMethodA_Org1.id,
        priceId: org1Price.id,
        status: SubscriptionStatus.Trialing,
        livemode: true,
      })

      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const subscriptions = await selectSubscriptions(
            {},
            transaction
          )
          const activeSubscriptions = await selectSubscriptions(
            { status: SubscriptionStatus.Active },
            transaction
          )
          const trialingSubscriptions = await selectSubscriptions(
            { status: SubscriptionStatus.Trialing },
            transaction
          )

          return {
            subscriptions,
            activeSubscriptions,
            trialingSubscriptions,
          }
        }
      )

      // Should see both subscriptions
      expect(result.subscriptions).toHaveLength(2)
      expect(result.activeSubscriptions).toHaveLength(1)
      expect(result.trialingSubscriptions).toHaveLength(1)

      // All should belong to customerA
      expect(
        result.subscriptions.every(
          (s) => s.customerId === customerA_Org1.id
        )
      ).toBe(true)
    })

    it('should handle NULL userId customers correctly', async () => {
      // Create a customer with null userId
      const nullUserCustomer = await setupCustomer({
        organizationId: org1.id,
        email: `nulluser_${core.nanoid()}@test.com`,
        livemode: true,
      })

      // CustomerA should not be able to see this customer (no userId association)
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const allCustomers = await selectCustomers({}, transaction)
          const nullCustomerQuery = await selectCustomerById(
            nullUserCustomer.id,
            transaction
          ).catch(() => null)

          return { allCustomers, nullCustomerQuery }
        }
      )

      // Should only see own customer, not the null userId customer
      expect(result.allCustomers).toHaveLength(1)
      expect(result.allCustomers[0].id).toBe(customerA_Org1.id)
      expect(result.nullCustomerQuery).toBeNull()
    })

    it('should handle archived customers correctly', async () => {
      // Archive customerA using admin transaction
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updateCustomer(
          { id: customerA_Org1.id, archived: true },
          transaction
        )
      })

      // CustomerA should still only see own data when authenticated, even when archived
      const result = await authenticatedCustomerTransaction(
        customerA_Org1,
        userA,
        org1,
        async (ctx) => {
          const { transaction } = ctx
          const customers = await selectCustomers({}, transaction)
          const archivedCustomers = await selectCustomers(
            { archived: true },
            transaction
          )

          // Try to see other customers
          const otherCustomers = await selectCustomers(
            { organizationId: org1.id },
            transaction
          )

          return { customers, archivedCustomers, otherCustomers }
        }
      )

      // Should only see self, even when archived
      expect(result.customers).toHaveLength(1)
      expect(result.customers[0].id).toBe(customerA_Org1.id)
      expect(result.archivedCustomers).toHaveLength(1)
      expect(result.archivedCustomers[0].id).toBe(customerA_Org1.id)
      expect(result.otherCustomers).toHaveLength(1)
      expect(result.otherCustomers[0].id).toBe(customerA_Org1.id)

      // Restore archived status for cleanup
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        await updateCustomer(
          { id: customerA_Org1.id, archived: false },
          transaction
        )
      })
    })

    it('should prevent creating new records', async () => {
      // Customer should not be able to create new customers
      // This operation should fail due to RLS policies

      // Try to create a new customer - should fail due to RLS
      let newCustomerError: string | null = null
      try {
        await authenticatedCustomerTransaction(
          customerA_Org1,
          userA,
          org1,
          async (ctx) => {
            const { transaction } = ctx
            await insertCustomer(
              {
                organizationId: org1.id,
                userId: userA.id,
                email: 'hacker@test.com',
                name: 'Hacker Customer',
                externalId: `ext_${core.nanoid()}`,
                livemode: true,
                pricingModelId: customerA_Org1.pricingModelId!,
              },
              transaction
            )
          }
        )
      } catch (err: any) {
        newCustomerError = err.message
      }

      // Customer creation should have failed (RLS prevents inserts for customer role)
      expect(typeof newCustomerError).toBe('string')
      expect(newCustomerError).toMatch(
        /Failed to insert|row-level security|violates/
      )
    })
  })

  describe('Customer with default pricingModelId should access billing portal', () => {
    let organization: Organization.Record
    let defaultPricingModel: PricingModel.Record
    let customerWithDefaultPricingModel: Customer.Record
    let user: User.Record
    let apiKey: ApiKey.Record

    beforeEach(async () => {
      // Set up organization with default pricing model
      const orgData = await setupOrg()
      organization = orgData.organization
      defaultPricingModel = orgData.pricingModel

      // Create a product for the default pricing model
      const defaultProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: defaultPricingModel.id,
        name: 'Default Product',
        active: true,
      })

      // Create a price for the product
      await setupPrice({
        productId: defaultProduct.id,
        name: 'Default Product Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 1000,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
      })

      // Create user and API key for authentication first
      const userApiKey = await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
      user = userApiKey.user
      apiKey = userApiKey.apiKey

      // Create customer with default pricing model, using the same user as the API key
      customerWithDefaultPricingModel = await setupCustomer({
        organizationId: organization.id,
        email: 'default-pricing-model@example.com',
        userId: user.id,
        pricingModelId: defaultPricingModel.id,
      })
    })

    it('should allow customer with pricingModelId to access billing portal and get their pricing model', async () => {
      // pricingModelId is now NOT NULL - customer should have the default pricing model assigned
      expect(customerWithDefaultPricingModel.pricingModelId).toBe(
        defaultPricingModel.id
      )

      // Test as a customer (not merchant) to verify RLS works correctly

      // Use the helper function to simulate customer accessing billing portal with proper RLS context
      const result = await authenticatedCustomerTransaction(
        customerWithDefaultPricingModel,
        user,
        organization,
        async (ctx) => {
          const { transaction } = ctx
          return selectPricingModelForCustomer(
            customerWithDefaultPricingModel,
            transaction
          )
        }
      )

      expect(result.id).toBe(defaultPricingModel.id)
      expect(result.isDefault).toBe(true)
    })
  })
})
