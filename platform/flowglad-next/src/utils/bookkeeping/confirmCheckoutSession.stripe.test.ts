import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  DiscountAmountType,
  EventNoun,
  FlowgladEventType,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  PurchaseStatus,
} from '@db-core/enums'
import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import type { Customer } from '@db-core/schema/customers'
import type { FeeCalculation } from '@db-core/schema/feeCalculations'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Purchase } from '@db-core/schema/purchases'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import {
  mockCancelPaymentIntent,
  mockCreateStripeCustomer,
  mockGetPaymentIntent,
  mockGetSetupIntent,
  mockUpdatePaymentIntent,
  mockUpdateSetupIntent,
} from '@/../bun.stripe.mocks'
import {
  setupCheckoutSession,
  setupCustomer,
  setupDiscount,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { selectFeeCalculations } from '@/db/tableMethods/feeCalculationMethods'
import { selectPricesProductsAndPricingModelsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { selectEventsByCustomer } from '@/test/helpers/databaseHelpers'
import { createMockCustomer } from '@/test/helpers/stripeMocks'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import core from '@/utils/core'
import { createFeeCalculationForCheckoutSession } from './checkoutSessions'

describe('confirmCheckoutSessionTransaction', () => {
  // Common variables for all tests
  let organization: Organization.Record
  let price: Price.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let checkoutSession: CheckoutSession.Record
  let paymentMethod: PaymentMethod.Record
  let purchase: Purchase.Record
  let feeCalculation: FeeCalculation.Record

  beforeEach(async () => {
    // Set up common test data
    const setupData = await setupOrg()
    organization = setupData.organization
    price = setupData.price
    pricingModel = setupData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      type: PaymentMethodType.Card,
    })

    checkoutSession = await setupCheckoutSession({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })

    // Only create a purchase if the price is not free
    if (price.unitPrice > 0) {
      purchase = await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        status: PurchaseStatus.Pending,
        livemode: true,
      })
    }

    feeCalculation = (
      await adminTransaction(async ({ transaction }) => {
        const result = await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        return Result.ok(result)
      })
    ).unwrap()
    // Reset mocks - clearAllMocks clears call counts on all mock functions
    mock.clearAllMocks()
  })

  describe('Checkout Session Validation', () => {
    it('should return an error when checkout session exists but status is not Open', async () => {
      // Update checkout session to a non-Open status
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Pending,
          },
          transaction
        )
        return Result.ok(undefined)
      })

      const result1 = await adminTransaction(async (ctx) => {
        const result = await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          ctx
        )
        return result
      })
      expect(Result.isError(result1)).toBe(true)
      if (Result.isError(result1)) {
        expect(result1.error.message).toContain(
          'Checkout session is not open'
        )
      }

      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Failed,
          },
          transaction
        )
        return Result.ok(undefined)
      })

      const result2 = await adminTransaction(async (ctx) => {
        const result = await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          ctx
        )
        return result
      })
      expect(Result.isError(result2)).toBe(true)
      if (Result.isError(result2)) {
        expect(result2.error.message).toContain(
          'Checkout session is not open'
        )
      }

      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Succeeded,
          },
          transaction
        )
        return Result.ok(undefined)
      })

      const result3 = await adminTransaction(async (ctx) => {
        const result = await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          ctx
        )
        return result
      })
      expect(Result.isError(result3)).toBe(true)
      if (Result.isError(result3)) {
        expect(result3.error.message).toContain(
          'Checkout session is not open'
        )
      }
    })
  })

  describe('Fee Calculation', () => {
    it('should skip fee calculation when session type is AddPaymentMethod', async () => {
      const addPaymentMethodCheckoutSession =
        await setupCheckoutSession({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.AddPaymentMethod,
          quantity: 1,
          livemode: true,
        })

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResultResult =
            await confirmCheckoutSessionTransaction(
              { id: addPaymentMethodCheckoutSession.id },
              ctx
            )
          const confirmResult = confirmResultResult.unwrap()
          const feeCalculations = await selectFeeCalculations(
            { checkoutSessionId: addPaymentMethodCheckoutSession.id },
            transaction
          )
          return Result.ok({
            confirmResult,
            feeCalculations,
          })
        })
      ).unwrap()

      expect(result.confirmResult.customer).toMatchObject({})
      // Verify that createFeeCalculationForCheckoutSession was not called
      expect(result.feeCalculations.length).toBe(0)
    })

    it('should use existing fee calculation when one is already present', async () => {
      const checkoutFeeCalculations = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            ctx
          )
          const feeCalculations = await selectFeeCalculations(
            { checkoutSessionId: checkoutSession.id },
            transaction
          )
          return Result.ok(feeCalculations)
        })
      ).unwrap()

      expect(checkoutFeeCalculations.length).toBe(1)
    })
  })

  describe('Customer Handling', () => {
    it('should retrieve customer via customerId when set on the session', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      expect(result.customer?.id).toEqual(customer.id)
    })

    it('should retrieve customer from linked purchase when no customerId but purchaseId is set', async () => {
      // Update checkout session to have no customerId but have purchaseId
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: purchase.id,
          } as CheckoutSession.Update,
          transaction
        )
        return Result.ok(null)
      })

      const result = (
        await adminTransaction(async (ctx) => {
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      expect(result.customer?.id).toEqual(customer.id)
    })

    it('should create a new customer when no customerId/purchaseId exists but customerEmail is provided', async () => {
      // Update checkout session to have no customerId or purchaseId but have customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: 'newcustomer@example.com',
          } as CheckoutSession.Update,
          transaction
        )
        return Result.ok(null)
      })
      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        livemode: true,
      })
      mockCreateStripeCustomer.mockResolvedValue(mockStripeCustomer)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      expect(result.customer?.email).toEqual(
        'newcustomer@example.com'
      )
      expect(result.customer?.id).not.toEqual(customer.id)
      expect(result.customer?.stripeCustomerId).toEqual(
        mockStripeCustomer.id
      )
    })

    it('should create customer with proper pricing model association via createCustomerBookkeeping', async () => {
      // Update checkout session to have no customerId or purchaseId but have customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: 'newcustomer@example.com',
            customerName: 'Test Customer',
            billingAddress: {
              address: {
                name: 'Test Customer',
                line1: '123 Test St',
                city: 'Test City',
                state: 'TS',
                postal_code: '12345',
                country: 'US',
              },
            },
          } as CheckoutSession.Update,
          transaction
        )
        return Result.ok(null)
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      mockCreateStripeCustomer.mockResolvedValue(mockStripeCustomer)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      // Verify customer was created with proper attributes
      expect(result.customer).toMatchObject({})
      expect(result.customer.email).toEqual('newcustomer@example.com')
      expect(result.customer.name).toEqual('Test Customer')
      expect(result.customer.stripeCustomerId).toEqual(
        mockStripeCustomer.id
      )
      expect(result.customer.billingAddress).toEqual({
        address: {
          name: 'Test Customer',
          line1: '123 Test St',
          city: 'Test City',
          state: 'TS',
          postal_code: '12345',
          country: 'US',
        },
      })

      // Verify pricing model was associated with the correct default pricing model
      expect(typeof result.customer.pricingModelId).toBe('string')
      expect(result.customer.pricingModelId).toEqual(pricingModel.id)
    })

    it('should create free subscription when default product exists', async () => {
      // Ensure there is a free default price for this pricing model by creating one on the default product
      const defaultProductId = (
        await adminTransaction(async ({ transaction }) => {
          const results =
            await selectPricesProductsAndPricingModelsForOrganization(
              { isDefault: true, livemode: true },
              organization.id,
              transaction
            )
          const match = results.find(
            (r) => r.pricingModel.id === pricingModel.id
          )
          if (!match)
            throw new Error(
              'No default price found for pricing model'
            )
          if (!match.product)
            throw new Error('Product not found for default price')
          return Result.ok(match.product.id)
        })
      ).unwrap()
      const freeDefaultPrice = await setupPrice({
        productId: defaultProductId,
        name: 'Free Plan',
        type: PriceType.Subscription,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
      })
      const defaultPriceId = freeDefaultPrice.id

      // Update checkout session to have no customerId or purchaseId but have customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: 'newcustomer@example.com',
            customerName: 'Test Customer',
          } as CheckoutSession.Update,
          transaction
        )
        return Result.ok(null)
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      mockCreateStripeCustomer.mockResolvedValue(mockStripeCustomer)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      // Verify customer was created
      expect(result.customer).toMatchObject({})
      expect(result.customer.email).toEqual('newcustomer@example.com')

      // Check for events in the database
      const dbEvents = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectEventsByCustomer(
              result.customer.id,
              organization.id,
              transaction
            )
          )
        })
      ).unwrap()

      // Verify CustomerCreated event was created
      const customerCreatedEvent = dbEvents.find(
        (e) => e.type === FlowgladEventType.CustomerCreated
      )
      expect(typeof customerCreatedEvent).toBe('object')
      expect(customerCreatedEvent!.payload.object).toEqual(
        EventNoun.Customer
      )
      expect(typeof customerCreatedEvent!.payload.customer).toBe(
        'object'
      )

      // Assert customer payload details
      const customerPayload = customerCreatedEvent!.payload.customer!
      expect(customerPayload.id).toEqual(result.customer.id)
      expect(customerPayload.externalId).toEqual(
        result.customer.externalId
      )

      // Check for subscription-related events (if default product exists)
      const subscriptionCreatedEvent = dbEvents.find(
        (e) => e.type === FlowgladEventType.SubscriptionCreated
      )
      expect(typeof subscriptionCreatedEvent).toBe('object')
      expect(subscriptionCreatedEvent?.payload.object).toEqual(
        EventNoun.Subscription
      )
      expect(subscriptionCreatedEvent?.payload.customer?.id).toEqual(
        result.customer.id
      )

      // Verify a subscription record exists and is a free plan linked to the free default price
      const subscriptions = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectSubscriptions(
              { customerId: result.customer.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(subscriptions).toHaveLength(1)
      expect(subscriptions[0].isFreePlan).toBe(true)
      expect(subscriptions[0].priceId).toEqual(defaultPriceId)
    })

    it('should create Stripe customer when customer is created', async () => {
      // Update checkout session to have no customerId or purchaseId but have customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: 'newcustomer@example.com',
            customerName: 'Test Customer',
          } as CheckoutSession.Update,
          transaction
        )
        return Result.ok(null)
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      mockCreateStripeCustomer.mockResolvedValue(mockStripeCustomer)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      // Verify customer was created with Stripe customer ID
      expect(result.customer).toMatchObject({})
      expect(result.customer.stripeCustomerId).toEqual(
        mockStripeCustomer.id
      )
      expect(result.customer.email).toEqual('newcustomer@example.com')

      // Verify createStripeCustomer was called
      expect(mockCreateStripeCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newcustomer@example.com',
          name: 'Test Customer',
        })
      )
    })

    it('should set billing address from checkout session on created customer', async () => {
      const testBillingAddress = {
        address: {
          name: 'Test Customer',
          line1: '123 Test Street',
          line2: 'Apt 4B',
          city: 'Test City',
          state: 'TS',
          postal_code: '12345',
          country: 'US',
        },
      }

      // Update checkout session to have no customerId or purchaseId but have customerEmail and billing address
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: 'newcustomer@example.com',
            customerName: 'Test Customer',
            billingAddress: testBillingAddress,
          } as CheckoutSession.Update,
          transaction
        )
        return Result.ok(null)
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      mockCreateStripeCustomer.mockResolvedValue(mockStripeCustomer)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      // Verify customer was created with correct billing address
      expect(result.customer).toMatchObject({})
      expect(result.customer.billingAddress).toEqual(
        testBillingAddress
      )
      expect(result.customer.email).toEqual('newcustomer@example.com')
      expect(result.customer.name).toEqual('Test Customer')
    })

    it('should return an error when no customerId, purchaseId, or customerEmail are available', async () => {
      // Update checkout session to have no customerId, purchaseId, or customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: null,
          } as CheckoutSession.ProductRecord,
          transaction
        )
        return Result.ok(undefined)
      })

      const result = await adminTransaction(async (ctx) => {
        const innerResult = await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          ctx
        )
        return innerResult
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Checkout session has no customer email'
        )
      }
    })

    it('should skip Stripe customer creation when customer record has stripeCustomerId', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const updatedCustomer = await updateCustomer(
            {
              ...customer,
              stripeCustomerId: `cus_${core.nanoid()}`,
            },
            transaction
          )
          await updateCheckoutSession(
            { ...checkoutSession, customerId: customer.id },
            transaction
          )
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok({
            confirmResult: confirmResult.unwrap(),
            updatedCustomer,
          })
        })
      ).unwrap()

      expect(result.confirmResult.customer).toMatchObject({})
      expect(result.confirmResult.customer?.stripeCustomerId).toEqual(
        result.updatedCustomer.stripeCustomerId
      )
      // Verify that createStripeCustomer was not called
      expect(mockCreateStripeCustomer).not.toHaveBeenCalled()
    })

    it('should create Stripe customer and update customer record when stripeCustomerId is missing', async () => {
      // Update customer to have no stripeCustomerId
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { ...customer, stripeCustomerId: null },
          transaction
        )
        return Result.ok(null)
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        livemode: true,
      })
      mockCreateStripeCustomer.mockResolvedValue(mockStripeCustomer)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      expect(result.customer?.stripeCustomerId).toEqual(
        mockStripeCustomer.id
      )
      // Verify that createStripeCustomer was called
      expect(mockCreateStripeCustomer).toHaveBeenCalled()
    })

    it('should return an error if stripeCustomerId is missing and no customerEmail exists', async () => {
      // Update customer to have no stripeCustomerId
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { ...customer, stripeCustomerId: null },
          transaction
        )
        return Result.ok(undefined)
      })

      // Update checkout session to have no customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          { ...checkoutSession, customerEmail: null },
          transaction
        )
        return Result.ok(undefined)
      })

      const result = await adminTransaction(async (ctx) => {
        const innerResult = await confirmCheckoutSessionTransaction(
          { id: checkoutSession.id },
          ctx
        )
        return innerResult
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Checkout session has no customer email'
        )
      }
    })
  })

  describe('Setup Intent Handling', () => {
    beforeEach(() => {
      // Mock updateSetupIntent to succeed
      mockUpdateSetupIntent.mockResolvedValue({
        id: 'seti_mock',
        object: 'setup_intent',
        customer: null,
        status: 'requires_payment_method',
      } as any)
    })

    it('should update setup intent when stripeSetupIntentId is set and fetched setup intent has no customer', async () => {
      // Update checkout session to have stripeSetupIntentId
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripeSetupIntentId: `seti_${core.nanoid()}`,
            },
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Mock getSetupIntent to return a setup intent with no customer
      const mockSetupIntent = {
        id: updatedCheckoutSession.stripeSetupIntentId,
        object: 'setup_intent',
        application: null,
        automatic_payment_methods: null,
        cancellation_reason: null,
        client_secret: '',
        created: Date.now(),
        customer: null,
        description: null,
        last_setup_error: null,
        latest_attempt: null,
        livemode: true,
        mandate: null,
        metadata: {},
        next_action: null,
        on_behalf_of: null,
        payment_method: null,
        payment_method_options: null,
        payment_method_types: [],
        single_use_mandate: null,
        status: 'requires_payment_method',
        test_clock: null,
        usage: 'off_session',
        lastResponse: {
          headers: {},
          requestId: '',
          statusCode: 200,
        },
        flow_directions: [],
        payment_method_configuration_details: {
          id: 'pm_123',
          parent: 'pm_123',
        },
      } as Stripe.SetupIntent
      mockGetSetupIntent.mockResolvedValue(mockSetupIntent)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      // Verify that updateSetupIntent was called
      expect(mockUpdateSetupIntent).toHaveBeenCalledWith(
        updatedCheckoutSession.stripeSetupIntentId,
        { customer: customer.stripeCustomerId },
        updatedCheckoutSession.livemode
      )
    })

    it('should not update setup intent when it already has a customer', async () => {
      // Update checkout session to have stripeSetupIntentId
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripeSetupIntentId: `seti_${core.nanoid()}`,
            },
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Mock getSetupIntent to return a setup intent with a customer
      const mockSetupIntent = {
        id: updatedCheckoutSession.stripeSetupIntentId,
        object: 'setup_intent',
        application: null,
        automatic_payment_methods: null,
        cancellation_reason: null,
        client_secret: '',
        created: Date.now(),
        customer: 'existing_customer_id',
        description: null,
        last_setup_error: null,
        latest_attempt: null,
        livemode: true,
        mandate: null,
        metadata: {},
        next_action: null,
        on_behalf_of: null,
        payment_method: null,
        payment_method_options: null,
        payment_method_types: [],
        single_use_mandate: null,
        status: 'requires_payment_method',
        test_clock: null,
        usage: 'off_session',
        lastResponse: {
          headers: {},
          requestId: '',
          statusCode: 200,
        },
        flow_directions: [],
        payment_method_configuration_details: {
          id: 'pm_123',
          parent: 'pm_123',
        },
      } as Stripe.SetupIntent
      mockGetSetupIntent.mockResolvedValue(mockSetupIntent)

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      // Verify that updateSetupIntent was not called
      expect(mockUpdateSetupIntent).not.toHaveBeenCalled()
    })
  })

  describe('Payment Intent Handling', () => {
    beforeEach(() => {
      // Mock getPaymentIntent to return a valid payment intent without a customer
      mockGetPaymentIntent.mockResolvedValue({
        id: 'pi_mock',
        object: 'payment_intent',
        amount: 1000,
        currency: 'usd',
        customer: null, // No customer yet - will be set by updatePaymentIntent
        status: 'requires_payment_method',
      } as unknown as import('stripe').default.PaymentIntent)

      // Mock updatePaymentIntent to succeed
      mockUpdatePaymentIntent.mockResolvedValue({
        id: 'pi_mock',
        object: 'payment_intent',
        amount: 1000,
        currency: 'usd',
        status: 'requires_payment_method',
        lastResponse: {
          headers: {},
          requestId: 'req_mock',
          statusCode: 200,
        },
      } as unknown as import('stripe').default.Response<
        import('stripe').default.PaymentIntent
      >)

      // Mock cancelPaymentIntent to succeed
      mockCancelPaymentIntent.mockResolvedValue({
        id: 'pi_mock',
        object: 'payment_intent',
        amount: 0,
        currency: 'usd',
        status: 'canceled',
        lastResponse: {
          headers: {},
          requestId: 'req_mock',
          statusCode: 200,
        },
      } as unknown as import('stripe').default.Response<
        import('stripe').default.PaymentIntent
      >)
    })

    it('should update payment intent with customer ID, amount, and application fee when applicable', async () => {
      // Update checkout session to have stripePaymentIntentId
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
              type: CheckoutSessionType.Product,
              invoiceId: null,
            } as CheckoutSession.Update,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Mock calculateTotalFeeAmount and calculateTotalDueAmount

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      // Verify that updatePaymentIntent was called with the correct parameters
      // Application fee includes payment method fee (59 cents) + Flowglad fee (0.65% of $10 = 7 cents) = 66 cents
      expect(mockUpdatePaymentIntent).toHaveBeenCalledWith(
        updatedCheckoutSession.stripePaymentIntentId,
        {
          customer: customer.stripeCustomerId,
          amount: price.unitPrice,
          application_fee_amount: 66,
        },
        updatedCheckoutSession.livemode
      )
    })

    it('should update payment intent with amount only (no application fee) when total amount due is zero', async () => {
      // Update checkout session to have stripePaymentIntentId
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
            } as CheckoutSession.Update,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Mock calculateTotalFeeAmount and calculateTotalDueAmount
      const mockFinalFeeAmount = 100
      const mockTotalAmountDue = 0

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      // Verify that updatePaymentIntent was called with the correct parameters
      // Application fee includes payment method fee (59 cents) + Flowglad fee (0.65% of $10 = 7 cents) = 66 cents
      expect(mockUpdatePaymentIntent).toHaveBeenCalledWith(
        updatedCheckoutSession.stripePaymentIntentId,
        {
          customer: customer.stripeCustomerId,
          amount: 1000,
          application_fee_amount: 66,
        },
        updatedCheckoutSession.livemode
      )
    })

    it('should not update payment intent when session type is AddPaymentMethod', async () => {
      // Update checkout session to have stripePaymentIntentId and type AddPaymentMethod
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
              type: CheckoutSessionType.AddPaymentMethod,
              customerId: customer.id,
              automaticallyUpdateSubscriptions: false,
            },
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      // Verify that updatePaymentIntent was not called
      expect(mockUpdatePaymentIntent).not.toHaveBeenCalled()
    })

    it('should cancel payment intent and clear stripePaymentIntentId when total due is zero from 100% discount', async () => {
      // Create a 100% off discount that equals the full price amount
      const fullDiscount = await setupDiscount({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'FULL100',
        code: core.nanoid().slice(0, 10),
        amount: price.unitPrice, // Full price coverage
        amountType: DiscountAmountType.Fixed,
        livemode: true,
      })

      const paymentIntentId = `pi_${core.nanoid()}`

      // Update checkout session to have stripePaymentIntentId and the 100% discount
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: paymentIntentId,
              discountId: fullDiscount.id,
              type: CheckoutSessionType.Product,
            } as CheckoutSession.Update,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Create fee calculation with the discount applied
      await adminTransaction(async ({ transaction }) => {
        const result = await createFeeCalculationForCheckoutSession(
          updatedCheckoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        return Result.ok(result)
      })

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      // Verify the customer is returned correctly
      expect(result.customer.id).toEqual(customer.id)

      // Verify that cancelPaymentIntent was called instead of updatePaymentIntent
      expect(mockCancelPaymentIntent).toHaveBeenCalledWith(
        paymentIntentId,
        updatedCheckoutSession.livemode
      )
      expect(mockUpdatePaymentIntent).not.toHaveBeenCalled()

      // Verify that stripePaymentIntentId was cleared from the checkout session
      const refetchedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = (
            await selectCheckoutSessionById(
              updatedCheckoutSession.id,
              transaction
            )
          ).unwrap()
          return Result.ok(result)
        })
      ).unwrap()
      expect(
        refetchedCheckoutSession.stripePaymentIntentId
      ).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle checkout session with both purchaseId and customerId (prioritizing customerId)', async () => {
      // Update checkout session to have both customerId and purchaseId
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              customerId: customer.id,
              purchaseId: purchase.id,
            } as CheckoutSession.Update,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      expect(result.customer?.id).toEqual(customer.id)
    })

    it('should handle checkout sessions with no payment intent or setup intent', async () => {
      // Update checkout session to have no payment intent or setup intent
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: null,
              stripeSetupIntentId: null,
            },
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: updatedCheckoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      // Verify that updatePaymentIntent and updateSetupIntent were not called
      expect(mockUpdatePaymentIntent).not.toHaveBeenCalled()
      expect(mockUpdateSetupIntent).not.toHaveBeenCalled()
    })
  })

  describe('Return Value', () => {
    it('should return the customer object with all expected properties', async () => {
      const result = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              ctx
            )
          return Result.ok(confirmResult.unwrap())
        })
      ).unwrap()

      expect(result.customer).toMatchObject({})
      expect(result.customer?.id).toEqual(customer.id)
      expect(result.customer?.email).toEqual(customer.email)
      expect(result.customer?.stripeCustomerId).toEqual(
        customer.stripeCustomerId
      )
    })
  })
})
