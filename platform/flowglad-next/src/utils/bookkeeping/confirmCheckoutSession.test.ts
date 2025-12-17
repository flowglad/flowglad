import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupCheckoutSession,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupPurchase,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Purchase } from '@/db/schema/purchases'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { selectFeeCalculations } from '@/db/tableMethods/feeCalculationMethods'
import { selectPricesProductsAndPricingModelsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { selectEventsByCustomer } from '@/test/helpers/databaseHelpers'
import { createMockCustomer } from '@/test/helpers/stripeMocks'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  FlowgladEventType,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  PurchaseStatus,
} from '@/types'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import core from '@/utils/core'
import {
  createStripeCustomer,
  getSetupIntent,
  updatePaymentIntent,
  updateSetupIntent,
} from '@/utils/stripe'
import { createFeeCalculationForCheckoutSession } from './checkoutSessions'

// Mock Stripe functions
vi.mock('@/utils/stripe', () => ({
  createStripeCustomer: vi.fn(),
  getPaymentIntent: vi.fn(async () => ({
    id: 'pi_test',
    object: 'payment_intent',
    customer: null,
  })),
  getSetupIntent: vi.fn(),
  updatePaymentIntent: vi.fn(),
  updateSetupIntent: vi.fn(),
}))

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

    feeCalculation = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        const result = await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        return { result }
      }
    )
    // Reset mocks
    vi.resetAllMocks()
  })

  describe('Checkout Session Validation', () => {
    it('should throw an error when checkout session exists but status is not Open', async () => {
      // Update checkout session to a non-Open status
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Pending,
          },
          transaction
        )
        return { result: null }
      })

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session is not open')
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Failed,
          },
          transaction
        )
        return { result: null }
      })

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session is not open')

      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Succeeded,
          },
          transaction
        )
        return { result: null }
      })

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session is not open')
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

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const confirmResult =
            await confirmCheckoutSessionTransaction(
              { id: addPaymentMethodCheckoutSession.id },
              transaction
            )
          const feeCalculations = await selectFeeCalculations(
            { checkoutSessionId: addPaymentMethodCheckoutSession.id },
            transaction
          )
          return {
            result: { confirmResult, feeCalculations },
          }
        }
      )

      expect(result.confirmResult.result.customer).toBeDefined()
      // Verify that createFeeCalculationForCheckoutSession was not called
      expect(result.feeCalculations.length).toBe(0)
    })

    it('should use existing fee calculation when one is already present', async () => {
      const checkoutFeeCalculations =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            await confirmCheckoutSessionTransaction(
              { id: checkoutSession.id },
              transaction
            )
            const feeCalculations = await selectFeeCalculations(
              { checkoutSessionId: checkoutSession.id },
              transaction
            )
            return { result: feeCalculations }
          }
        )

      expect(checkoutFeeCalculations.length).toBe(1)
    })
  })

  describe('Customer Handling', () => {
    it('should retrieve customer via customerId when set on the session', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      expect(result.customer?.id).toEqual(customer.id)
    })

    it('should retrieve customer from linked purchase when no customerId but purchaseId is set', async () => {
      // Update checkout session to have no customerId but have purchaseId
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: purchase.id,
          } as CheckoutSession.Update,
          transaction
        )
        return { result: null }
      })

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      expect(result.customer?.id).toEqual(customer.id)
    })

    it('should create a new customer when no customerId/purchaseId exists but customerEmail is provided', async () => {
      // Update checkout session to have no customerId or purchaseId but have customerEmail
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: 'newcustomer@example.com',
          } as CheckoutSession.Update,
          transaction
        )
        return { result: null }
      })
      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        livemode: true,
      })
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer
      )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
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
      await comprehensiveAdminTransaction(async ({ transaction }) => {
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
        return { result: null }
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer
      )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      // Verify customer was created with proper attributes
      expect(result.customer).toBeDefined()
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
      expect(result.customer.pricingModelId).toBeDefined()
      expect(result.customer.pricingModelId).toEqual(pricingModel.id)
    })

    it('should create free subscription when default product exists', async () => {
      // Ensure there is a free default price for this pricing model by creating one on the default product
      const defaultProductId = await adminTransaction(
        async ({ transaction }) => {
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
          return match.product.id
        }
      )
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
      await comprehensiveAdminTransaction(async ({ transaction }) => {
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
        return { result: null }
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer
      )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      // Verify customer was created
      expect(result.customer).toBeDefined()
      expect(result.customer.email).toEqual('newcustomer@example.com')

      // Check for events in the database
      const dbEvents = await adminTransaction(
        async ({ transaction }) => {
          return selectEventsByCustomer(
            result.customer.id,
            organization.id,
            transaction
          )
        }
      )

      // Verify CustomerCreated event was created
      const customerCreatedEvent = dbEvents.find(
        (e) => e.type === FlowgladEventType.CustomerCreated
      )
      expect(customerCreatedEvent).toBeDefined()
      expect(customerCreatedEvent!.payload.object).toEqual('customer')
      expect(customerCreatedEvent!.payload.customer).toBeDefined()

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
      expect(subscriptionCreatedEvent).toBeDefined()
      expect(subscriptionCreatedEvent?.payload.object).toEqual(
        'subscription'
      )
      expect(subscriptionCreatedEvent?.payload.customer?.id).toEqual(
        result.customer.id
      )

      // Verify a subscription record exists and is a free plan linked to the free default price
      const subscriptions = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptions(
            { customerId: result.customer.id },
            transaction
          )
        }
      )
      expect(subscriptions).toHaveLength(1)
      expect(subscriptions[0].isFreePlan).toBe(true)
      expect(subscriptions[0].priceId).toEqual(defaultPriceId)
    })

    it('should create Stripe customer when customer is created', async () => {
      // Update checkout session to have no customerId or purchaseId but have customerEmail
      await comprehensiveAdminTransaction(async ({ transaction }) => {
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
        return { result: null }
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer
      )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      // Verify customer was created with Stripe customer ID
      expect(result.customer).toBeDefined()
      expect(result.customer.stripeCustomerId).toEqual(
        mockStripeCustomer.id
      )
      expect(result.customer.email).toEqual('newcustomer@example.com')

      // Verify createStripeCustomer was called
      expect(createStripeCustomer).toHaveBeenCalledWith(
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
      await comprehensiveAdminTransaction(async ({ transaction }) => {
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
        return { result: null }
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        name: 'Test Customer',
        livemode: true,
      })
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer
      )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      // Verify customer was created with correct billing address
      expect(result.customer).toBeDefined()
      expect(result.customer.billingAddress).toEqual(
        testBillingAddress
      )
      expect(result.customer.email).toEqual('newcustomer@example.com')
      expect(result.customer.name).toEqual('Test Customer')
    })

    it('should throw an error when no customerId, purchaseId, or customerEmail are available', async () => {
      // Update checkout session to have no customerId, purchaseId, or customerEmail
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: null,
            customerEmail: null,
          } as CheckoutSession.ProductRecord,
          transaction
        )
        return { result: null }
      })

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session has no customer email')
    })

    it('should skip Stripe customer creation when customer record has stripeCustomerId', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
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
              transaction
            )
          return {
            result: { confirmResult, updatedCustomer },
          }
        }
      )

      expect(result.confirmResult.result.customer).toBeDefined()
      expect(
        result.confirmResult.result.customer?.stripeCustomerId
      ).toEqual(result.updatedCustomer.stripeCustomerId)
      // Verify that createStripeCustomer was not called
      expect(createStripeCustomer).not.toHaveBeenCalled()
    })

    it('should create Stripe customer and update customer record when stripeCustomerId is missing', async () => {
      // Update customer to have no stripeCustomerId
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { ...customer, stripeCustomerId: null },
          transaction
        )
        return { result: null }
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = createMockCustomer({
        email: 'newcustomer@example.com',
        livemode: true,
      })
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer
      )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      expect(result.customer?.stripeCustomerId).toEqual(
        mockStripeCustomer.id
      )
      // Verify that createStripeCustomer was called
      expect(createStripeCustomer).toHaveBeenCalled()
    })

    it('should throw an error if stripeCustomerId is missing and no customerEmail exists', async () => {
      // Update customer to have no stripeCustomerId
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { ...customer, stripeCustomerId: null },
          transaction
        )
        return { result: null }
      })

      // Update checkout session to have no customerEmail
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          { ...checkoutSession, customerEmail: null },
          transaction
        )
        return { result: null }
      })

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session has no customer email')
    })
  })

  describe('Setup Intent Handling', () => {
    it('should update setup intent when stripeSetupIntentId is set and fetched setup intent has no customer', async () => {
      // Update checkout session to have stripeSetupIntentId
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                stripeSetupIntentId: `seti_${core.nanoid()}`,
              },
              transaction
            )
            return { result }
          }
        )

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
      vi.mocked(getSetupIntent).mockResolvedValue(mockSetupIntent)

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updateSetupIntent was called
      expect(updateSetupIntent).toHaveBeenCalledWith(
        updatedCheckoutSession.stripeSetupIntentId,
        { customer: customer.stripeCustomerId },
        updatedCheckoutSession.livemode
      )
    })

    it('should not update setup intent when it already has a customer', async () => {
      // Update checkout session to have stripeSetupIntentId
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                stripeSetupIntentId: `seti_${core.nanoid()}`,
              },
              transaction
            )
            return { result }
          }
        )

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
      vi.mocked(getSetupIntent).mockResolvedValue(mockSetupIntent)

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updateSetupIntent was not called
      expect(updateSetupIntent).not.toHaveBeenCalled()
    })
  })

  describe('Payment Intent Handling', () => {
    it('should update payment intent with customer ID, amount, and application fee when applicable', async () => {
      // Update checkout session to have stripePaymentIntentId
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                stripePaymentIntentId: `pi_${core.nanoid()}`,
                type: CheckoutSessionType.Product,
                invoiceId: null,
              } as CheckoutSession.Update,
              transaction
            )
            return { result }
          }
        )

      // Mock calculateTotalFeeAmount and calculateTotalDueAmount

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updatePaymentIntent was called with the correct parameters
      // Application fee includes payment method fee (59 cents) + Flowglad fee (0.65% of $10 = 7 cents) = 66 cents
      expect(updatePaymentIntent).toHaveBeenCalledWith(
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
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                stripePaymentIntentId: `pi_${core.nanoid()}`,
              } as CheckoutSession.Update,
              transaction
            )
            return { result }
          }
        )

      // Mock calculateTotalFeeAmount and calculateTotalDueAmount
      const mockFinalFeeAmount = 100
      const mockTotalAmountDue = 0

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updatePaymentIntent was called with the correct parameters
      // Application fee includes payment method fee (59 cents) + Flowglad fee (0.65% of $10 = 7 cents) = 66 cents
      expect(updatePaymentIntent).toHaveBeenCalledWith(
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
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
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
            return { result }
          }
        )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updatePaymentIntent was not called
      expect(updatePaymentIntent).not.toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle checkout session with both purchaseId and customerId (prioritizing customerId)', async () => {
      // Update checkout session to have both customerId and purchaseId
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                customerId: customer.id,
                purchaseId: purchase.id,
              } as CheckoutSession.Update,
              transaction
            )
            return { result }
          }
        )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      expect(result.customer?.id).toEqual(customer.id)
    })

    it('should handle checkout sessions with no payment intent or setup intent', async () => {
      // Update checkout session to have no payment intent or setup intent
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                stripePaymentIntentId: null,
                stripeSetupIntentId: null,
              },
              transaction
            )
            return { result }
          }
        )

      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updatePaymentIntent and updateSetupIntent were not called
      expect(updatePaymentIntent).not.toHaveBeenCalled()
      expect(updateSetupIntent).not.toHaveBeenCalled()
    })
  })

  describe('Return Value', () => {
    it('should return the customer object with all expected properties', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      expect(result.customer?.id).toEqual(customer.id)
      expect(result.customer?.email).toEqual(customer.email)
      expect(result.customer?.stripeCustomerId).toEqual(
        customer.stripeCustomerId
      )
    })
  })
})
