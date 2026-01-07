import { afterEach, describe, expect, it } from 'vitest'
import type { Customer } from '@/db/schema/customers'
import {
  cleanupStripeTestData,
  describeIfStripeKey,
  getStripeTestClient,
} from '@/test/stripeIntegrationHelpers'
import core from '@/utils/core'
import {
  createCustomerSessionForCheckout,
  createStripeCustomer,
} from '@/utils/stripe'

describeIfStripeKey('Stripe Integration Tests', () => {
  describe('createStripeCustomer', () => {
    let createdCustomerId: string | undefined

    afterEach(async () => {
      if (createdCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId: createdCustomerId,
        })
        createdCustomerId = undefined
      }
    })

    it('creates a customer with email and name, returns valid Stripe customer object', async () => {
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`
      const testOrgId = `org_${core.nanoid()}`

      const stripeCustomer = await createStripeCustomer({
        email: testEmail,
        name: testName,
        organizationId: testOrgId,
        livemode: false,
        createdBy: 'createCustomerBookkeeping',
      })

      createdCustomerId = stripeCustomer.id

      expect(stripeCustomer.id).toMatch(/^cus_/)
      expect(stripeCustomer.email).toBe(testEmail)
      expect(stripeCustomer.name).toBe(testName)
      expect(stripeCustomer.livemode).toBe(false)

      const stripe = getStripeTestClient()
      const retrievedCustomer = await stripe.customers.retrieve(
        stripeCustomer.id
      )
      expect(retrievedCustomer.id).toBe(stripeCustomer.id)
      expect(retrievedCustomer.deleted).not.toBe(true)
    })

    it('creates a customer with metadata containing organizationId', async () => {
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`
      const testOrgId = `org_${core.nanoid()}`

      const stripeCustomer = await createStripeCustomer({
        email: testEmail,
        name: testName,
        organizationId: testOrgId,
        livemode: false,
        createdBy: 'confirmCheckoutSession',
      })

      createdCustomerId = stripeCustomer.id

      expect(stripeCustomer.metadata?.organizationId).toBe(testOrgId)
      expect(stripeCustomer.metadata?.createdBy).toBe(
        'confirmCheckoutSession'
      )
    })
  })

  describe('createCustomerSessionForCheckout', () => {
    let createdCustomerId: string | undefined

    afterEach(async () => {
      if (createdCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId: createdCustomerId,
        })
        createdCustomerId = undefined
      }
    })

    it('creates a customer session for an existing customer, returns client_secret', async () => {
      const stripe = getStripeTestClient()
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`

      const stripeCustomer = await stripe.customers.create({
        email: testEmail,
        name: testName,
      })
      createdCustomerId = stripeCustomer.id

      const customerRecord: Customer.Record = {
        id: `cust_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 1,
        organizationId: `org_${core.nanoid()}`,
        email: testEmail,
        name: testName,
        invoiceNumberBase: 'INV-TEST',
        archived: false,
        stripeCustomerId: stripeCustomer.id,
        taxId: null,
        logoURL: null,
        iconURL: null,
        domain: null,
        billingAddress: null,
        externalId: `ext_${core.nanoid()}`,
        userId: null,
        pricingModelId: null,
        stackAuthHostedBillingUserId: null,
        livemode: false,
      }

      const clientSecret =
        await createCustomerSessionForCheckout(customerRecord)

      expect(typeof clientSecret).toBe('string')
      expect(clientSecret).toContain('_secret_')
    })

    it('throws error when customer has no stripeCustomerId', async () => {
      const customerRecord: Customer.Record = {
        id: `cust_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 1,
        organizationId: `org_${core.nanoid()}`,
        email: `test+${core.nanoid()}@flowglad-integration.com`,
        name: `Test Customer ${core.nanoid()}`,
        invoiceNumberBase: 'INV-TEST',
        archived: false,
        stripeCustomerId: null,
        taxId: null,
        logoURL: null,
        iconURL: null,
        domain: null,
        billingAddress: null,
        externalId: `ext_${core.nanoid()}`,
        userId: null,
        pricingModelId: null,
        stackAuthHostedBillingUserId: null,
        livemode: false,
      }

      await expect(
        createCustomerSessionForCheckout(customerRecord)
      ).rejects.toThrow(
        'Missing stripeCustomerId for customer session creation'
      )
    })
  })
})
