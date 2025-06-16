import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
  PurchaseStatus,
} from '@/types'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import { Customer } from '@/db/schema/customers'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPurchase,
  setupCheckoutSession,
} from '../../../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  deleteExpiredCheckoutSessionsAndFeeCalculations,
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  selectFeeCalculations,
  selectLatestFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import {
  createStripeCustomer,
  getSetupIntent,
  updatePaymentIntent,
  updateSetupIntent,
} from '@/utils/stripe'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import {
  FeeCalculation,
  feeCalculations,
} from '@/db/schema/feeCalculations'
import { Purchase } from '@/db/schema/purchases'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
  finalizeFeeCalculation,
} from '@/utils/bookkeeping/fees'
import core from '@/utils/core'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import Stripe from 'stripe'
import { createFeeCalculationForCheckoutSession } from './checkoutSessions'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'

type StripeCustomer = Stripe.Customer
type SetupIntent = Stripe.SetupIntent

// Mock Stripe functions
vi.mock('@/utils/stripe', () => ({
  createStripeCustomer: vi.fn(),
  getSetupIntent: vi.fn(),
  updatePaymentIntent: vi.fn(),
  updateSetupIntent: vi.fn(),
}))

describe('confirmCheckoutSessionTransaction', () => {
  // Common variables for all tests
  let organization: Organization.Record
  let price: Price.Record
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

    purchase = await setupPurchase({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
      status: PurchaseStatus.Pending,
      livemode: true,
    })

    feeCalculation = await adminTransaction(
      async ({ transaction }) => {
        return await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
      }
    )
    // Reset mocks
    vi.resetAllMocks()
  })

  describe('Checkout Session Validation', () => {
    it('should throw an error when checkout session exists but status is not Open', async () => {
      // Update checkout session to a non-Open status
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Pending,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session is not open')
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Failed,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session is not open')

      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Succeeded,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
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

      const { result, feeCalculations } = await adminTransaction(
        async ({ transaction }) => {
          const result = await confirmCheckoutSessionTransaction(
            { id: addPaymentMethodCheckoutSession.id },
            transaction
          )
          const feeCalculations = await selectFeeCalculations(
            { checkoutSessionId: addPaymentMethodCheckoutSession.id },
            transaction
          )
          return {
            result,
            feeCalculations,
          }
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that createFeeCalculationForCheckoutSession was not called
      expect(feeCalculations.length).toBe(0)
    })

    it('should use existing fee calculation when one is already present', async () => {
      const checkoutFeeCalculations = await adminTransaction(
        async ({ transaction }) => {
          await confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
          return selectFeeCalculations(
            { checkoutSessionId: checkoutSession.id },
            transaction
          )
        }
      )

      expect(checkoutFeeCalculations.length).toBe(1)
    })
  })

  describe('Customer Handling', () => {
    it('should retrieve customer via customerId when set on the session', async () => {
      const result = await adminTransaction(
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
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
            purchaseId: purchase.id,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const result = await adminTransaction(
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
      })
      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = {
        id: `cus_${core.nanoid()}`,
        object: 'customer',
        balance: 0,
        created: Date.now(),
        default_source: null,
        delinquent: false,
        description: null,
        email: 'newcustomer@example.com',
        invoice_prefix: null,
        livemode: true,
        metadata: {},
        name: null,
        phone: null,
        preferred_locales: [],
        shipping: null,
        tax_exempt: 'none',
        test_clock: null,
        lastResponse: {
          headers: {},
          requestId: '',
          statusCode: 200,
        },
        invoice_settings: {
          default_payment_method: null,
          footer: null,
          rendering_options: null,
          custom_fields: [],
        },
      } as StripeCustomer
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer as Stripe.Response<Stripe.Customer>
      )

      const result = await adminTransaction(
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

    it('should throw an error when no customerId, purchaseId, or customerEmail are available', async () => {
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
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session has no customer email')
    })

    it('should skip Stripe customer creation when customer record has stripeCustomerId', async () => {
      const { result, updatedCustomer } = await adminTransaction(
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
          const result = await confirmCheckoutSessionTransaction(
            { id: checkoutSession.id },
            transaction
          )
          return {
            result,
            updatedCustomer,
          }
        }
      )

      expect(result.customer).toBeDefined()
      expect(result.customer?.stripeCustomerId).toEqual(
        updatedCustomer.stripeCustomerId
      )
      // Verify that createStripeCustomer was not called
      expect(createStripeCustomer).not.toHaveBeenCalled()
    })

    it('should create Stripe customer and update customer record when stripeCustomerId is missing', async () => {
      // Update customer to have no stripeCustomerId
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { ...customer, stripeCustomerId: null },
          transaction
        )
      })

      // Mock createStripeCustomer to return a new Stripe customer ID
      const mockStripeCustomer = {
        id: `cus_${core.nanoid()}`,
        object: 'customer',
        balance: 0,
        created: Date.now(),
        default_source: null,
        delinquent: false,
        description: null,
        email: 'newcustomer@example.com',
        invoice_prefix: null,
        livemode: true,
        metadata: {},
        name: null,
        phone: null,
        preferred_locales: [],
        shipping: null,
        tax_exempt: 'none',
        test_clock: null,
        lastResponse: {
          headers: {},
          requestId: '',
          statusCode: 200,
        },
        invoice_settings: {
          default_payment_method: null,
          footer: null,
          rendering_options: null,
          custom_fields: [],
        },
      } as StripeCustomer
      vi.mocked(createStripeCustomer).mockResolvedValue(
        mockStripeCustomer as Stripe.Response<Stripe.Customer>
      )

      const result = await adminTransaction(
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
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { ...customer, stripeCustomerId: null },
          transaction
        )
      })

      // Update checkout session to have no customerEmail
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          { ...checkoutSession, customerEmail: null },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
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
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              stripeSetupIntentId: `seti_${core.nanoid()}`,
            },
            transaction
          )
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
      } as SetupIntent
      vi.mocked(getSetupIntent).mockResolvedValue(mockSetupIntent)

      const result = await adminTransaction(
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
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return await updateCheckoutSession(
            {
              ...checkoutSession,
              stripeSetupIntentId: `seti_${core.nanoid()}`,
            },
            transaction
          )
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
      } as SetupIntent
      vi.mocked(getSetupIntent).mockResolvedValue(mockSetupIntent)

      const result = await adminTransaction(
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
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
              type: CheckoutSessionType.Product,
              invoiceId: null,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      // Mock calculateTotalFeeAmount and calculateTotalDueAmount

      const result = await adminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updatePaymentIntent was called with the correct parameters
      expect(updatePaymentIntent).toHaveBeenCalledWith(
        updatedCheckoutSession.stripePaymentIntentId,
        {
          customer: customer.stripeCustomerId,
          amount: price.unitPrice,
          application_fee_amount: 59,
        },
        updatedCheckoutSession.livemode
      )
    })

    it('should update payment intent with amount only (no application fee) when total amount due is zero', async () => {
      // Update checkout session to have stripePaymentIntentId
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      // Mock calculateTotalFeeAmount and calculateTotalDueAmount
      const mockFinalFeeAmount = 100
      const mockTotalAmountDue = 0

      const result = await adminTransaction(
        async ({ transaction }) => {
          return confirmCheckoutSessionTransaction(
            { id: updatedCheckoutSession.id },
            transaction
          )
        }
      )

      expect(result.customer).toBeDefined()
      // Verify that updatePaymentIntent was called with the correct parameters
      expect(updatePaymentIntent).toHaveBeenCalledWith(
        updatedCheckoutSession.stripePaymentIntentId,
        {
          customer: customer.stripeCustomerId,
          amount: 1000,
          application_fee_amount: 59,
        },
        updatedCheckoutSession.livemode
      )
    })

    it('should not update payment intent when session type is AddPaymentMethod', async () => {
      // Update checkout session to have stripePaymentIntentId and type AddPaymentMethod
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
              type: CheckoutSessionType.AddPaymentMethod,
              customerId: customer.id,
              automaticallyUpdateSubscriptions: false,
            },
            transaction
          )
        }
      )

      const result = await adminTransaction(
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
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return await updateCheckoutSession(
            {
              ...checkoutSession,
              customerId: customer.id,
              purchaseId: purchase.id,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const result = await adminTransaction(
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
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: null,
              stripeSetupIntentId: null,
            },
            transaction
          )
        }
      )

      const result = await adminTransaction(
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
      const result = await adminTransaction(
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
