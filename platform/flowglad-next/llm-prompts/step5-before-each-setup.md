# Before Each Setup for processPaymentIntentSucceeded Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { stripePaymentIntentSucceededTask } from '@/trigger/stripe/payment-intent-succeeded'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupCheckoutSession,
  setupPrice,
  setupProduct,
  setupDiscount,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Payment } from '@/db/schema/payments'
import { Purchase } from '@/db/schema/purchases'
import { Invoice } from '@/db/schema/invoices'
import { Event } from '@/db/schema/events'
import {
  CheckoutSessionType,
  CheckoutSessionStatus,
  PaymentStatus,
  PurchaseStatus,
  InvoiceStatus,
  FlowgladEventType,
  EventNoun,
  PriceType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'
import Stripe from 'stripe'
import { core } from '@/utils/core'

describe('processPaymentIntentSucceeded - Anonymous Customer Checkout', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  let checkoutSession: CheckoutSession.Record
  let paymentIntent: Stripe.PaymentIntent
  let stripeCharge: Stripe.Charge
  let existingCustomer: Customer.Record | null = null

  beforeEach(async () => {
    // Set up organization with product and price
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price

    // Create anonymous checkout session
    checkoutSession = await setupCheckoutSession({
      organizationId: organization.id,
      type: CheckoutSessionType.Product,
      priceId: price.id,
      customerId: null, // Anonymous checkout
      customerEmail: `anonymous+${core.nanoid()}@test.com`,
      customerName: 'Anonymous Customer',
      status: CheckoutSessionStatus.Open,
      livemode: true,
    })

    // Create mock Stripe payment intent
    paymentIntent = {
      id: `pi_${core.nanoid()}`,
      object: 'payment_intent',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded',
      metadata: {
        type: 'checkout_session',
        checkoutSessionId: checkoutSession.id,
      },
      latest_charge: `ch_${core.nanoid()}`,
      created: Math.floor(Date.now() / 1000),
    } as Stripe.PaymentIntent

    // Create mock Stripe charge
    stripeCharge = {
      id: paymentIntent.latest_charge as string,
      object: 'charge',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded',
      customer: `cus_${core.nanoid()}`,
      billing_details: {
        name: 'Anonymous Customer',
        email: checkoutSession.customerEmail,
        address: {
          line1: '123 Test St',
          city: 'Test City',
          state: 'TS',
          postal_code: '12345',
          country: 'US',
        },
      },
      created: Math.floor(Date.now() / 1000),
    } as Stripe.Charge
  })

  describe('Anonymous Customer Creation', () => {
    it('should create customer with correct data when anonymous user completes checkout', () => {
      // setup:
      // - use default anonymous checkout session from beforeEach
      // - use default payment intent and charge from beforeEach

      // expects:
      // - customer record created with correct email, name, organizationId
      // - customer has pricing model ID assigned
      // - customer has Stripe customer ID linked
      // - purchase record created and linked to customer
      // - events table contains customer creation events
      // - ledger commands executed for customer creation
      // - invoice created for purchase
    })

    it('should link to existing customer when anonymous user uses existing email', () => {
      // setup:
      // - create existing customer with same email as checkout session
      // - use default payment intent and charge from beforeEach

      // expects:
      // - no new customer created
      // - purchase linked to existing customer
      // - events generated for purchase (not customer creation)
      // - invoice created for purchase
    })

    it('should create customer with Stripe customer ID when provided', () => {
      // setup:
      // - use default anonymous checkout session from beforeEach
      // - use default payment intent and charge from beforeEach
      // - charge already has customer ID from beforeEach

      // expects:
      // - customer created with Stripe customer ID
      // - Stripe customer properly linked
      // - all other side effects as first test
    })

    it('should create customer with correct pricing model for specific product', () => {
      // setup:
      // - create additional price for same product
      // - update checkout session to use new price
      // - use default payment intent and charge from beforeEach

      // expects:
      // - customer created with correct pricing model
      // - purchase linked to correct price/product
      // - events and ledger reflect correct pricing
    })

    it('should handle discount application for anonymous customer', () => {
      // setup:
      // - create discount for the product
      // - update checkout session to include discount
      // - use default payment intent and charge from beforeEach

      // expects:
      // - customer created normally
      // - purchase created with discount applied
      // - discount redemption record created
      // - events include discount information
      // - ledger commands include discount
    })
  })

  describe('Error Handling', () => {
    it('should throw error when payment intent has invalid metadata', () => {
      // setup:
      // - create payment intent with invalid metadata
      // - use default checkout session from beforeEach

      // expects:
      // - should throw appropriate error
      // - no customer should be created
      // - no side effects should occur
    })

    it('should throw error when payment intent has no latest charge', () => {
      // setup:
      // - create payment intent without latest_charge
      // - use default checkout session from beforeEach

      // expects:
      // - should throw error about missing charge
      // - no customer should be created
      // - no side effects should occur
    })

    it('should throw error when Stripe charge cannot be retrieved', () => {
      // setup:
      // - create payment intent with invalid charge ID
      // - mock Stripe API to return null for charge
      // - use default checkout session from beforeEach

      // expects:
      // - should throw error about missing charge
      // - no customer should be created
      // - no side effects should occur
    })
  })

  describe('Integration with Comprehensive Transactions', () => {
    it('should process all side effects atomically', () => {
      // setup:
      // - use default anonymous checkout session from beforeEach
      // - use default payment intent and charge from beforeEach
      // - simulate database error during processing

      // expects:
      // - all operations should succeed or fail together
      // - no partial state should be left in database
      // - events and ledger should be processed atomically
    })

    it('should handle events and ledger commands properly', () => {
      // setup:
      // - use default anonymous checkout session from beforeEach
      // - use default payment intent and charge from beforeEach
      // - process through comprehensive transaction

      // expects:
      // - customer creation events stored in events table
      // - ledger commands executed for customer creation
      // - purchase events stored properly
      // - invoice events stored properly
    })
  })

  describe('Stripe Integration', () => {
    it('should properly link Stripe customer data', () => {
      // setup:
      // - use default anonymous checkout session from beforeEach
      // - use default payment intent and charge from beforeEach
      // - charge already has customer data from beforeEach

      // expects:
      // - customer record has correct Stripe customer ID
      // - Stripe customer data properly linked
      // - billing details stored correctly
    })

    it('should handle payment intent webhook data correctly', () => {
      // setup:
      // - use default anonymous checkout session from beforeEach
      // - create payment intent webhook event
      // - process through webhook handler

      // expects:
      // - webhook data properly parsed
      // - customer created with webhook data
      // - all side effects processed correctly
    })
  })
})
```
