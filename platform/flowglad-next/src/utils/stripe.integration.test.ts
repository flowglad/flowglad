import { afterEach, describe, expect, it } from 'vitest'
import type { Customer } from '@/db/schema/customers'
import {
  cleanupStripeTestData,
  createTestStripeCustomer,
  describeIfStripeKey,
  getStripeTestClient,
} from '@/test/stripeIntegrationHelpers'
import core from '@/utils/core'
import { createCustomerSessionForCheckout } from '@/utils/stripe'

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

    it('creates a customer with email, name, and metadata, returns valid Stripe customer object that can be retrieved', async () => {
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`
      const testOrgId = `org_${core.nanoid()}`

      const stripe = getStripeTestClient()
      const stripeCustomer = await stripe.customers.create({
        email: testEmail,
        name: testName,
        metadata: {
          organizationId: testOrgId,
          createdBy: 'createCustomerBookkeeping',
        },
      })

      createdCustomerId = stripeCustomer.id

      // Verify customer ID format and basic properties
      expect(stripeCustomer.id).toMatch(/^cus_/)
      expect(stripeCustomer.email).toBe(testEmail)
      expect(stripeCustomer.name).toBe(testName)
      expect(stripeCustomer.livemode).toBe(false)

      // Verify metadata is stored correctly
      expect(stripeCustomer.metadata?.organizationId).toBe(testOrgId)
      expect(stripeCustomer.metadata?.createdBy).toBe(
        'createCustomerBookkeeping'
      )

      // Verify customer can be retrieved from Stripe
      const retrievedCustomer = await stripe.customers.retrieve(
        stripeCustomer.id
      )
      expect(retrievedCustomer.id).toBe(stripeCustomer.id)
      expect(retrievedCustomer.deleted).not.toBe(true)
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
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`

      const stripeCustomer = await createTestStripeCustomer({
        email: testEmail,
        name: testName,
      })
      createdCustomerId = stripeCustomer.id

      const stripe = getStripeTestClient()
      const customerSession = await stripe.customerSessions.create({
        customer: stripeCustomer.id,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_redisplay: 'enabled',
            },
          },
        },
      })

      expect(typeof customerSession.client_secret).toBe('string')
      expect(customerSession.client_secret).toContain('_secret_')
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
