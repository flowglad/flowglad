# Test Stubs for processPaymentIntentSucceeded - Anonymous Customer Checkout

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

describe('processPaymentIntentSucceeded - Anonymous Customer Checkout', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  let checkoutSession: CheckoutSession.Record
  let paymentIntent: Stripe.PaymentIntent
  let stripeCharge: Stripe.Charge

  beforeEach(async () => {
    // setup:
    // - create organization with product and price
    // - create anonymous checkout session
    // - create mock payment intent and charge data
  })

  describe('Anonymous Customer Creation', () => {
    it('should create customer with correct data when anonymous user completes checkout', () => {
      // setup:
      // - create anonymous checkout session with customer email and name
      // - create successful payment intent with matching billing details
      // - mock Stripe charge with customer data

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
      // - create existing customer with specific email
      // - create anonymous checkout session with same email
      // - create successful payment intent

      // expects:
      // - no new customer created
      // - purchase linked to existing customer
      // - events generated for purchase (not customer creation)
      // - invoice created for purchase
    })

    it('should create customer with Stripe customer ID when provided', () => {
      // setup:
      // - create anonymous checkout session
      // - create successful payment intent with Stripe customer ID
      // - mock Stripe charge with customer data

      // expects:
      // - customer created with Stripe customer ID
      // - Stripe customer properly linked
      // - all other side effects as first test
    })

    it('should create customer with correct pricing model for specific product', () => {
      // setup:
      // - create organization with multiple products/prices
      // - create anonymous checkout session with specific price
      // - create successful payment intent

      // expects:
      // - customer created with correct pricing model
      // - purchase linked to correct price/product
      // - events and ledger reflect correct pricing
    })

    it('should handle discount application for anonymous customer', () => {
      // setup:
      // - create organization with product, price, and discount
      // - create anonymous checkout session with discount code
      // - create successful payment intent

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
      // - create organization and checkout session
      // - create payment intent with invalid metadata
      // - attempt to process

      // expects:
      // - should throw appropriate error
      // - no customer should be created
      // - no side effects should occur
    })

    it('should throw error when payment intent has no latest charge', () => {
      // setup:
      // - create organization and checkout session
      // - create payment intent without latest_charge
      // - attempt to process

      // expects:
      // - should throw error about missing charge
      // - no customer should be created
      // - no side effects should occur
    })

    it('should throw error when Stripe charge cannot be retrieved', () => {
      // setup:
      // - create organization and checkout session
      // - create payment intent with invalid charge ID
      // - mock Stripe API to return null for charge

      // expects:
      // - should throw error about missing charge
      // - no customer should be created
      // - no side effects should occur
    })
  })

  describe('Integration with Comprehensive Transactions', () => {
    it('should process all side effects atomically', () => {
      // setup:
      // - create anonymous checkout session
      // - create successful payment intent
      // - simulate database error during processing

      // expects:
      // - all operations should succeed or fail together
      // - no partial state should be left in database
      // - events and ledger should be processed atomically
    })

    it('should handle events and ledger commands properly', () => {
      // setup:
      // - create anonymous checkout session
      // - create successful payment intent
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
      // - create anonymous checkout session
      // - create successful payment intent with Stripe customer
      // - mock Stripe customer data

      // expects:
      // - customer record has correct Stripe customer ID
      // - Stripe customer data properly linked
      // - billing details stored correctly
    })

    it('should handle payment intent webhook data correctly', () => {
      // setup:
      // - create anonymous checkout session
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
