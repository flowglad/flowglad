import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  setupCheckoutSession,
  setupCustomer,
  setupDiscount,
  setupFeeCalculation,
  setupOrg,
  setupPaymentMethod,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Discount } from '@/db/schema/discounts'
import {
  type FeeCalculation,
  feeCalculations,
} from '@/db/schema/feeCalculations'
import { type BillingAddress } from '@/db/schema/organizations'
import type { Purchase } from '@/db/schema/purchases'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  selectPurchaseById,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import type { DbTransaction } from '@/db/types'
import { selectEventsByCustomer } from '@/test/helpers/databaseHelpers'
import {
  createDiscardingEffectsContext,
  createProcessingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  DiscountAmountType,
  EventNoun,
  FlowgladEventType,
  PaymentMethodType,
  PurchaseStatus,
  StripeConnectContractType,
} from '@/types'
import {
  checkoutSessionStatusFromStripeCharge,
  editCheckoutSession,
  editCheckoutSessionBillingAddress,
  processPurchaseBookkeepingForCheckoutSession,
  processStripeChargeForCheckoutSession,
} from '@/utils/bookkeeping/checkoutSessions'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/fees/checkoutSession'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import core from '../core'

type TestCharge = Pick<
  Stripe.Charge,
  | 'id'
  | 'object'
  | 'amount'
  | 'currency'
  | 'status'
  | 'created'
  | 'customer'
  | 'payment_intent'
  | 'payment_method'
  | 'payment_method_details'
  | 'receipt_url'
  | 'balance_transaction'
  | 'invoice'
  | 'metadata'
  | 'billing_details'
  | 'livemode'
  | 'description'
>
// Helper functions to generate mock Stripe objects with random IDs
const mockSucceededCharge = (
  checkoutSessionId: string,
  stripeCustomerId: string,
  amount: number = 1000
): TestCharge => ({
  id: `ch_${core.nanoid()}`,
  object: 'charge',
  amount,
  currency: 'usd',
  status: 'succeeded',
  created: Math.floor(Date.now() / 1000),
  customer: stripeCustomerId,
  payment_intent: `pi_${core.nanoid()}`,
  payment_method: `pm_${core.nanoid()}`,
  payment_method_details: {
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      amount_authorized: amount,
      authorization_code: '123456',
      checks: {
        address_line1_check: 'pass',
        address_postal_code_check: 'pass',
        cvc_check: 'pass',
      },
      country: 'US',
      exp_month: 1,
      exp_year: 2024,
      funding: 'credit',
      installments: null,
      mandate: null,
      network: 'visa',
      three_d_secure: null,
      wallet: null,
    },
  },
  billing_details: {
    name: 'Test Customer',
    email: 'test@example.com',
    address: {
      line1: '123 Test St',
      line2: 'Apt 1',
      city: 'Test City',
      state: 'Test State',
      postal_code: '12345',
      country: 'US',
    },
    phone: '+1234567890',
  },
  livemode: false,
  metadata: {
    checkoutSessionId: checkoutSessionId,
  },
  description: 'Test Charge',
  receipt_url: 'https://example.com/receipt',
  balance_transaction: `txn_${core.nanoid()}`,
  invoice: `in_${core.nanoid()}`,
})

const mockPendingCharge = (
  checkoutSessionId: string,
  stripeCustomerId: string,
  amount: number = 1000
): TestCharge => ({
  ...mockSucceededCharge(checkoutSessionId, stripeCustomerId, amount),
  id: `ch_${core.nanoid()}`,
  status: 'pending',
})

const mockFailedCharge = (
  checkoutSessionId: string,
  stripeCustomerId: string,
  amount: number = 1000
): TestCharge => ({
  ...mockSucceededCharge(checkoutSessionId, stripeCustomerId, amount),
  id: `ch_${core.nanoid()}`,
  status: 'failed',
})

describe('Checkout Sessions', () => {
  // Common variables for all tests - organization/price/pricingModel set in beforeAll
  let organization: Awaited<
    ReturnType<typeof setupOrg>
  >['organization']
  let price: Awaited<ReturnType<typeof setupOrg>>['price']
  let pricingModel: Awaited<
    ReturnType<typeof setupOrg>
  >['pricingModel']
  let customer: Customer.Record
  let checkoutSession: CheckoutSession.Record
  let purchase: Purchase.Record
  let feeCalculation: FeeCalculation.Record
  let discount: Discount.Record
  let succeededCharge: TestCharge

  beforeAll(async () => {
    // Setup organization once for all tests in this describe block
    const orgSetup = (await setupOrg()).unwrap()
    organization = orgSetup.organization
    price = orgSetup.price
    pricingModel = orgSetup.pricingModel
  })

  beforeEach(async () => {
    // Set up common test data
    customer = (
      await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: `cus_${core.nanoid()}`,
      })
    ).unwrap()

    await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      type: PaymentMethodType.Card,
    })

    checkoutSession = (
      await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
    ).unwrap()

    purchase = await setupPurchase({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
      status: PurchaseStatus.Pending,
      livemode: true,
    })

    discount = await setupDiscount({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'TEST10',
      code: `${Date.now()}`,
      amount: 10,
      amountType: DiscountAmountType.Fixed,
      livemode: true,
    })

    feeCalculation = await setupFeeCalculation({
      checkoutSessionId: checkoutSession.id,
      organizationId: organization.id,
      priceId: price.id,
      livemode: true,
    })

    // Generate a new charge for each test
    succeededCharge = mockSucceededCharge(
      checkoutSession.id,
      customer.stripeCustomerId ?? `cus_${core.nanoid()}`
    )
  })

  describe('createFeeCalculationForCheckoutSession', () => {
    it('should include discount when discountId is provided', async () => {
      // Update checkout session to include discount
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              discountId: discount.id,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const feeCalculationWithDiscount = await adminTransaction(
        async ({ transaction }) => {
          return createFeeCalculationForCheckoutSession(
            updatedCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
        }
      )
      expect(feeCalculationWithDiscount.discountId).toEqual(
        discount.id
      )
      expect(feeCalculationWithDiscount.discountAmountFixed).toEqual(
        discount.amount
      )
    })

    it('should correctly fetch price, product, and organization data', async () => {
      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
        }
      )

      expect(typeof feeCalculation).toBe('object')
      expect(feeCalculation.priceId).toEqual(checkoutSession.priceId)
      expect(feeCalculation.organizationId).toEqual(organization.id)
      expect(feeCalculation.checkoutSessionId).toEqual(
        checkoutSession.id
      )
      expect(feeCalculation.billingAddress).toEqual(
        checkoutSession.billingAddress!
      )
      expect(feeCalculation.paymentMethodType).toEqual(
        checkoutSession.paymentMethodType!
      )
    })

    it('should create fee calculation with correct parameters', async () => {
      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
        }
      )

      expect(typeof feeCalculation).toBe('object')
      expect(feeCalculation.checkoutSessionId).toEqual(
        checkoutSession.id
      )
      expect(feeCalculation.billingAddress).toEqual(
        checkoutSession.billingAddress!
      )
      expect(feeCalculation.paymentMethodType).toEqual(
        checkoutSession.paymentMethodType!
      )
    })
  })

  describe('editCheckoutSession', () => {
    it('should throw "Checkout session is not open" when session status is not Open', async () => {
      // Update checkout session to a non-open status
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            status: CheckoutSessionStatus.Succeeded,
          } as CheckoutSession.Update,
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return editCheckoutSession(
            {
              checkoutSession: {
                id: checkoutSession.id,
                type: CheckoutSessionType.Purchase,
                priceId: price.id,
                targetSubscriptionId: null,
                automaticallyUpdateSubscriptions: null,
              },
            },
            createDiscardingEffectsContext(transaction)
          )
        })
      ).rejects.toThrow('Checkout session is not open')
    })

    it('should update checkout session with merged fields from previous and new session', async () => {
      const newBillingAddress = {
        line1: '123 New St',
        line2: 'Apt 2',
        city: 'New City',
        state: 'New State',
        postal_code: '54321',
        country: 'US',
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSession(
            {
              checkoutSession: {
                ...checkoutSession,
                billingAddress: {
                  address: newBillingAddress,
                },
                invoiceId: null,
                priceId: price.id,
                targetSubscriptionId: null,
                automaticallyUpdateSubscriptions: null,
                preserveBillingCycleAnchor: false,
                type: CheckoutSessionType.Product,
              },
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      expect(
        (result.checkoutSession.billingAddress! as BillingAddress)
          .address
      ).toEqual(newBillingAddress)
    })

    it('should skip fee calculation when updated session is not fee-ready', async () => {
      // Update checkout session to be not fee-ready
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          await deleteFeeCalculation(feeCalculation.id, transaction)
          return updateCheckoutSession(
            {
              ...checkoutSession,
              priceId: price.id,
              billingAddress: null,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const latestFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          await editCheckoutSession(
            {
              checkoutSession: updatedCheckoutSession,
            },
            createDiscardingEffectsContext(transaction)
          )
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )

      expect(latestFeeCalculation).toBeNull()
    })

    it('should create new fee calculation when fee parameters have changed', async () => {
      const newBillingAddress = {
        line1: '123 New St',
        line2: 'Apt 2',
        city: 'New City',
        state: 'New State',
        postal_code: '54321',
        country: 'US',
      }
      let priorFeeCalculation: FeeCalculation.Record | null = null
      const latestFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          priorFeeCalculation = await selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
          await editCheckoutSession(
            {
              checkoutSession: {
                ...checkoutSession,
                invoiceId: null,
                targetSubscriptionId: null,
                automaticallyUpdateSubscriptions: null,
                billingAddress: {
                  address: newBillingAddress,
                },
                /**
                 * FIXME: review why we have preserveBillingCycleAnchor required
                 */
                preserveBillingCycleAnchor: false,
                type: CheckoutSessionType.Product,
                priceId: price.id,
              },
            },
            createDiscardingEffectsContext(transaction)
          )
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )
      expect(typeof priorFeeCalculation).toBe('object')
      expect(typeof latestFeeCalculation).toBe('object')
      expect(latestFeeCalculation!.id).not.toEqual(
        priorFeeCalculation!.id
      )
    })

    it('should use existing fee calculation when parameters have not changed', async () => {
      let priorFeeCalculation: FeeCalculation.Record | null = null
      const latestFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          priorFeeCalculation = await selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
          await editCheckoutSession(
            {
              checkoutSession: {
                id: checkoutSession.id,
                priceId: price.id,
                type: CheckoutSessionType.Product,
              },
            },
            createDiscardingEffectsContext(transaction)
          )
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )

      expect(typeof latestFeeCalculation).toBe('object')
      expect(latestFeeCalculation!.id).toEqual(
        priorFeeCalculation!.id
      )
    })

    it('should throw "Purchase is not pending" when purchase status is not Pending', async () => {
      // Update purchase to a non-pending status
      await adminTransaction(async ({ transaction }) => {
        await updatePurchase(
          {
            id: purchase.id,
            priceType: purchase.priceType,
            status: PurchaseStatus.Paid,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return editCheckoutSession(
            {
              checkoutSession: {
                id: checkoutSession.id,
                type: CheckoutSessionType.Product,
                priceId: price.id,
                targetSubscriptionId: null,
                automaticallyUpdateSubscriptions: null,
              },
              purchaseId: purchase.id,
            },
            createDiscardingEffectsContext(transaction)
          )
        })
      ).rejects.toThrow('Purchase is not pending')
    })

    it('should update purchase with new billing address when purchase is pending', async () => {
      const newBillingAddress = {
        line1: '123 New St',
        line2: 'Apt 2',
        city: 'New City',
        state: 'New State',
        postal_code: '54321',
        country: 'US',
      }

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: {
              ...checkoutSession,
              priceId: price.id,
              billingAddress: {
                address: newBillingAddress,
              },
              type: CheckoutSessionType.Product,
              invoiceId: null,
              targetSubscriptionId: null,
              automaticallyUpdateSubscriptions: null,
              preserveBillingCycleAnchor: false,
            },
            purchaseId: purchase.id,
          },
          createDiscardingEffectsContext(transaction)
        )
      })

      const updatedPurchase = await adminTransaction(
        async ({ transaction }) => {
          return (
            await selectPurchaseById(purchase.id, transaction)
          ).unwrap()
        }
      )

      expect(
        (updatedPurchase.billingAddress as BillingAddress)['address']
      ).toEqual(newBillingAddress)
    })

    it('should skip Stripe payment intent update when no fee calculation exists', async () => {
      // Delete fee calculation
      await adminTransaction(async ({ transaction }) => {
        await deleteFeeCalculation(feeCalculation.id, transaction)
      })

      // Update checkout session to have a payment intent
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId: `pi_${core.nanoid()}`,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const latestFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          await editCheckoutSession(
            {
              checkoutSession: {
                id: checkoutSession.id,
                type: CheckoutSessionType.Product,
                invoiceId: null,
                priceId: price.id,
                targetSubscriptionId: null,
                automaticallyUpdateSubscriptions: null,
              },
            },
            createDiscardingEffectsContext(transaction)
          )
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )

      expect(latestFeeCalculation).toBeNull()
    })

    it('calculates zero total due when a 100% fixed discount is applied that equals the price amount', async () => {
      // Create a 100% off discount that equals the full price amount (10000 cents = $100)
      const fullDiscount = await setupDiscount({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'FULL100',
        code: core.nanoid().slice(0, 10), // Short unique code
        amount: 10000, // $100.00 in cents - full price coverage
        amountType: DiscountAmountType.Fixed,
        livemode: true,
      })

      // Update checkout session to include the full discount
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              discountId: fullDiscount.id,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      // Create fee calculation for this session with the discount
      const feeCalculationWith100Discount = await adminTransaction(
        async ({ transaction }) => {
          return createFeeCalculationForCheckoutSession(
            updatedCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
        }
      )

      const totalDue = calculateTotalDueAmount(
        feeCalculationWith100Discount
      )

      expect(feeCalculationWith100Discount.discountId).toEqual(
        fullDiscount.id
      )
      expect(
        feeCalculationWith100Discount.discountAmountFixed
      ).toEqual(fullDiscount.amount)
      // The total due should be 0 when discount equals or exceeds the price
      expect(totalDue).toEqual(0)
    })

    it('does not attempt to update the payment intent when total due is 0 from a 100% discount', async () => {
      // Create a 100% off discount
      const fullDiscount = await setupDiscount({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'FULL100_PI',
        code: core.nanoid().slice(0, 10), // Short unique code
        amount: 10000, // $100.00 in cents - full price coverage
        amountType: DiscountAmountType.Fixed,
        livemode: true,
      })

      // First, set up a checkout session with a payment intent
      const checkoutSessionWithPI = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      // Create the initial fee calculation so editCheckoutSession sees it
      await adminTransaction(async ({ transaction }) => {
        return createFeeCalculationForCheckoutSession(
          checkoutSessionWithPI as CheckoutSession.FeeReadyRecord,
          transaction
        )
      })

      // Apply the 100% discount via editCheckoutSession
      const result = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSession(
            {
              checkoutSession: {
                ...checkoutSessionWithPI,
                discountId: fullDiscount.id,
              },
            },
            createDiscardingEffectsContext(transaction)
          )
        }
      )

      // Verify the checkout session was updated with the discount
      expect(result.checkoutSession.discountId).toEqual(
        fullDiscount.id
      )

      // The fee calculation should now reflect the discount
      const latestFeeCalc = await adminTransaction(
        async ({ transaction }) => {
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )

      const totalDue = calculateTotalDueAmount(latestFeeCalc!)

      // Verify total due is 0
      expect(totalDue).toEqual(0)
      // Note: The editCheckoutSession implementation skips the payment intent update when totalDue <= 0.
      // This is intentional - the PaymentIntent will be cancelled at confirmation time
      // in confirmCheckoutSessionTransaction when it detects totalAmountDue === 0.
    })
  })

  describe('processPurchaseBookkeepingForCheckoutSession', () => {
    it('should create customer creation events when creating a new customer for anonymous checkout', async () => {
      // Update checkout session to have no customer ID (anonymous checkout)
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              customerId: null,
              customerEmail: 'anonymous@example.com',
              customerName: 'Anonymous Customer',
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const bookkeepingResult = await adminTransaction(
        async (params) => {
          const result =
            await processPurchaseBookkeepingForCheckoutSession(
              {
                checkoutSession: updatedCheckoutSession,
                stripeCustomerId: `cus_${core.nanoid()}`,
              },
              createProcessingEffectsContext(params)
            )
          return Result.ok(result)
        }
      )

      // Verify customer was created
      expect(typeof bookkeepingResult.customer).toBe('object')
      expect(bookkeepingResult.customer.email).toEqual(
        'anonymous@example.com'
      )
      expect(bookkeepingResult.customer.name).toEqual(
        'Anonymous Customer'
      )

      const dbEvents = await adminTransaction(
        async ({ transaction }) => {
          return selectEventsByCustomer(
            bookkeepingResult.customer.id,
            organization.id,
            transaction
          )
        }
      )

      // Verify specific event types were created in database
      const customerCreatedEvent = dbEvents.find(
        (e) => e.type === FlowgladEventType.CustomerCreated
      )
      expect(typeof customerCreatedEvent).toBe('object')
      expect(customerCreatedEvent?.payload.object).toEqual(
        EventNoun.Customer
      )
      expect(typeof customerCreatedEvent?.payload.customer).toBe(
        'object'
      )

      // Type guard to ensure customer exists
      if (customerCreatedEvent?.payload.customer) {
        expect(customerCreatedEvent.payload.customer.id).toEqual(
          bookkeepingResult.customer.id
        )
        expect(
          customerCreatedEvent.payload.customer.externalId
        ).toEqual(bookkeepingResult.customer.externalId)
      }

      // Check for subscription-related events
      const subscriptionCreatedEvent = dbEvents.find(
        (e) => e.type === FlowgladEventType.SubscriptionCreated
      )
      expect(typeof subscriptionCreatedEvent).toBe('object')
      expect(subscriptionCreatedEvent?.payload.object).toEqual(
        EventNoun.Subscription
      )
      expect(subscriptionCreatedEvent?.payload.customer?.id).toEqual(
        bookkeepingResult.customer.id
      )
    })

    it('should use existing customer when linked to purchase', async () => {
      // Update checkout session to have a purchase ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            preserveBillingCycleAnchor: false,
            type: CheckoutSessionType.Purchase,
            purchaseId: purchase.id,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const result = await adminTransaction(async (params) => {
        const bookkeeping =
          await processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(bookkeeping)
      })

      expect(result.customer.id).toEqual(customer.id)
    })

    it('should use existing customer when linked to checkout session', async () => {
      const result = await adminTransaction(async (params) => {
        const bookkeeping =
          await processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(bookkeeping)
      })

      expect(result.customer.id).toEqual(customer.id)
    })

    it('should throw error when provided Stripe customer ID does not match existing customer', async () => {
      // Update checkout session to have a purchase ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            purchaseId: purchase.id,
          } as CheckoutSession.Update,
          transaction
        )
      })

      await expect(
        adminTransaction(async (params) => {
          const bookkeeping =
            await processPurchaseBookkeepingForCheckoutSession(
              {
                checkoutSession,
                stripeCustomerId: 'different-stripe-id',
              },
              createProcessingEffectsContext(params)
            )
          return Result.ok(bookkeeping)
        })
      ).rejects.toThrow('Attempting to process checkout session')
    })

    it('should find customer by Stripe customer ID when provided', async () => {
      const result = await adminTransaction(async (params) => {
        const bookkeeping =
          await processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: customer.stripeCustomerId!,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(bookkeeping)
      })

      expect(result.customer.id).toEqual(customer.id)
    })

    it('should make the charge.customer equal to the customer.stripeCustomerId, even if the checkouSession initially does not have a customer', async () => {
      // Update checkout session to have no customer ID
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              customerId: null,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const result = await adminTransaction(async (params) => {
        const bookkeeping =
          await processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession: updatedCheckoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(bookkeeping)
      })

      expect(result.customer.stripeCustomerId).toEqual(
        succeededCharge.customer! as string
      )
    })

    it('should create new Stripe customer when no Stripe customer ID is provided', async () => {
      // Update checkout session to have no customer ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId:
              succeededCharge.payment_intent! as string,
            customerId: null,
          } as CheckoutSession.Update,
          transaction
        )
      })
      const result = await adminTransaction(async (params) => {
        const bookkeeping =
          await processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(bookkeeping)
      })
      expect(typeof result.customer.stripeCustomerId).toBe('string')
    })

    it('should create new purchase when none exists', async () => {
      // Update checkout session to have no purchase ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            type: CheckoutSessionType.Product,
            purchaseId: null,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const newPurchaseResult = await adminTransaction(
        async (params) => {
          const bookkeeping =
            await processPurchaseBookkeepingForCheckoutSession(
              {
                checkoutSession,
                stripeCustomerId: succeededCharge.customer! as string,
              },
              createProcessingEffectsContext(params)
            )
          return Result.ok(bookkeeping)
        }
      )

      expect(typeof newPurchaseResult.purchase.id).toBe('string')
    })

    it('should apply discount when fee calculation has a discount ID', async () => {
      // Update fee calculation to have a discount ID
      await adminTransaction(async (params) => {
        const { transaction } = params
        const updatedCheckoutSession = await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId:
              succeededCharge.payment_intent! as string,
            discountId: discount.id,
          },
          transaction
        )
        const result =
          await processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession: updatedCheckoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            createProcessingEffectsContext(params)
          )
        const [discountRedemption] = await selectDiscountRedemptions(
          {
            purchaseId: result.purchase.id,
          },
          transaction
        )
        expect(typeof discountRedemption).toBe('object')
        expect(discountRedemption.discountId).toEqual(discount.id)
        return Result.ok(discountRedemption)
      })
    })

    it('should link fee calculation to purchase record', async () => {
      const { latestFeeCalculation, bookkeepingResult } =
        await adminTransaction(async (params) => {
          const { transaction } = params
          const bookkeepingResult =
            await processPurchaseBookkeepingForCheckoutSession(
              {
                checkoutSession,
                stripeCustomerId: succeededCharge.customer! as string,
              },
              createProcessingEffectsContext(params)
            )
          const latestFeeCalculation =
            await selectLatestFeeCalculation(
              {
                checkoutSessionId: checkoutSession.id,
              },
              transaction
            )
          return Result.ok({
            latestFeeCalculation,
            bookkeepingResult,
          })
        })

      expect(latestFeeCalculation?.purchaseId).toEqual(
        bookkeepingResult.purchase.id
      )
    })

    it('should throw error when no fee calculation is found for session', async () => {
      // Delete fee calculation
      await adminTransaction(async ({ transaction }) => {
        await deleteFeeCalculation(feeCalculation.id, transaction)
      })

      await expect(
        adminTransaction(async (params) => {
          const bookkeeping =
            await processPurchaseBookkeepingForCheckoutSession(
              {
                checkoutSession,
                stripeCustomerId: succeededCharge.customer! as string,
              },
              createProcessingEffectsContext(params)
            )
          return Result.ok(bookkeeping)
        })
      ).rejects.toThrow()
    })
  })

  describe('checkoutSessionStatusFromStripeCharge', () => {
    it('should return Succeeded when charge status is succeeded', () => {
      const result =
        checkoutSessionStatusFromStripeCharge(succeededCharge)
      expect(result).toEqual(CheckoutSessionStatus.Succeeded)
    })

    it('should return Pending when charge status is pending', () => {
      const pendingCharge = mockPendingCharge(
        checkoutSession.id,
        customer.stripeCustomerId!
      )
      const result =
        checkoutSessionStatusFromStripeCharge(pendingCharge)
      expect(result).toEqual(CheckoutSessionStatus.Pending)
    })

    it('should return Failed when charge status is neither succeeded nor pending', () => {
      const failedCharge = mockFailedCharge(
        checkoutSession.id,
        customer.stripeCustomerId!
      )
      const result =
        checkoutSessionStatusFromStripeCharge(failedCharge)
      expect(result).toEqual(CheckoutSessionStatus.Failed)
    })
  })

  describe('processStripeChargeForCheckoutSession', () => {
    it('should process purchase bookkeeping and create invoice for non-invoice sessions with status Pending or Succeeded', async () => {
      const result = await adminTransaction(async (params) => {
        const { transaction } = params
        await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId:
              succeededCharge.payment_intent! as string,
          },
          transaction
        )
        const chargeResult =
          await processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: succeededCharge,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(chargeResult)
      })

      expect(result.purchase).toMatchObject({})
      expect(result.invoice).toMatchObject({})
      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
    })

    it('should skip bookkeeping and invoice creation for non-invoice sessions with Failed status', async () => {
      const failedCharge = mockFailedCharge(
        checkoutSession.id,
        customer.stripeCustomerId!
      )

      const result = await adminTransaction(async (params) => {
        const chargeResult =
          await processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: failedCharge,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(chargeResult)
      })

      expect(result.purchase).toBeNull()
      expect(result.invoice).toBeNull()
    })

    it('should update checkout session with customer information from charge', async () => {
      const result = await adminTransaction(async (params) => {
        const { transaction } = params
        await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId:
              succeededCharge.payment_intent! as string,
          },
          transaction
        )

        const chargeResult =
          await processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: succeededCharge,
            },
            createProcessingEffectsContext(params)
          )
        return Result.ok(chargeResult)
      })

      expect(result.checkoutSession.customerName).toEqual(
        succeededCharge.billing_details?.name
      )
      expect(result.checkoutSession.customerEmail).toEqual(
        succeededCharge.billing_details?.email
      )
    })
  })
})

describe('editCheckoutSessionBillingAddress', async () => {
  // Setup organizations for all tests in this describe block
  const { organization: morOrganization, price: morPrice } =
    await setupOrg({
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
    })
  const morCustomer = (
    await setupCustomer({
      organizationId: morOrganization.id,
    })
  ).unwrap()

  describe('for MOR organizations', () => {
    let morCheckoutSession: CheckoutSession.Record

    beforeEach(async () => {
      // Set up MOR checkout session with paymentMethodType but no billingAddress
      const session = (
        await setupCheckoutSession({
          organizationId: morOrganization.id,
          customerId: morCustomer.id,
          priceId: morPrice.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: false,
        })
      ).unwrap()
      // Update to remove billing address for testing
      morCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...session,
              billingAddress: null,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )
    })

    it('calculates tax when billing address is set and session becomes fee-ready', async () => {
      const billingAddress: BillingAddress = {
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: morCheckoutSession.id,
              billingAddress,
            },
            transaction
          )
        }
      )

      expect(result.checkoutSession.billingAddress!).toEqual(
        billingAddress
      )
      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation!.organizationId).toEqual(
        morOrganization.id
      )
      // Tax should be calculated for MOR - taxAmountFixed should be a number (may be 0 in test mode)
      expect(typeof result.feeCalculation!.taxAmountFixed).toBe(
        'number'
      )
    })

    it('recalculates tax when billing address state changes', async () => {
      const caAddress: BillingAddress = {
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
      }

      // First set CA address
      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: morCheckoutSession.id,
              billingAddress: caAddress,
            },
            transaction
          )
        }
      )

      const firstFeeCalculationId = firstResult.feeCalculation?.id

      // Then change to a different state (OR)
      const orAddress: BillingAddress = {
        address: {
          line1: '456 New St',
          city: 'Portland',
          state: 'OR',
          postal_code: '97201',
          country: 'US',
        },
      }

      const secondResult = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: morCheckoutSession.id,
              billingAddress: orAddress,
            },
            transaction
          )
        }
      )

      expect(secondResult.checkoutSession.billingAddress!).toEqual(
        orAddress
      )
      expect(typeof secondResult.feeCalculation).toBe('object')
      // A new fee calculation should be created since billing address changed
      expect(secondResult.feeCalculation!.id).not.toEqual(
        firstFeeCalculationId
      )
    })

    it('returns null feeCalculation when session is not fee-ready (missing paymentMethodType)', async () => {
      // Create session and remove paymentMethodType
      const session = (
        await setupCheckoutSession({
          organizationId: morOrganization.id,
          customerId: morCustomer.id,
          priceId: morPrice.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: false,
        })
      ).unwrap()
      // Update to remove paymentMethodType and billingAddress for testing
      const notFeeReadySession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...session,
              paymentMethodType: null,
              billingAddress: null,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const billingAddress: BillingAddress = {
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: notFeeReadySession.id,
              billingAddress,
            },
            transaction
          )
        }
      )

      expect(result.checkoutSession.billingAddress!).toEqual(
        billingAddress
      )
      expect(result.feeCalculation).toBeNull()
    })
  })

  describe('for Platform organizations', () => {
    // Setup Platform organization for tests in this describe block
    let platformOrganization: Awaited<
      ReturnType<typeof setupOrg>
    >['organization']
    let platformPrice: Awaited<ReturnType<typeof setupOrg>>['price']

    beforeAll(async () => {
      const platformOrgSetup = await setupOrg({
        stripeConnectContractType: StripeConnectContractType.Platform,
      })
      platformOrganization = platformOrgSetup.organization
      platformPrice = platformOrgSetup.price
    })

    it('returns null feeCalculation for Platform organizations (no tax calculation)', async () => {
      const platformCustomer = (
        await setupCustomer({
          organizationId: platformOrganization.id,
        })
      ).unwrap()

      const session = (
        await setupCheckoutSession({
          organizationId: platformOrganization.id,
          customerId: platformCustomer.id,
          priceId: platformPrice.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: false,
        })
      ).unwrap()
      const platformCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...session,
              billingAddress: null,
            } as CheckoutSession.Update,
            transaction
          )
        }
      )

      const billingAddress: BillingAddress = {
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: platformCheckoutSession.id,
              billingAddress,
            },
            transaction
          )
        }
      )

      expect(result.checkoutSession.billingAddress!).toEqual(
        billingAddress
      )
      // Platform orgs should not calculate fees/tax
      expect(result.feeCalculation).toBeNull()
    })
  })

  describe('error cases', () => {
    it("throws 'No checkout sessions found' when checkout session does not exist", async () => {
      const billingAddress: BillingAddress = {
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: 'non-existent-id',
              billingAddress,
            },
            transaction
          )
        })
      ).rejects.toThrow('No checkout sessions found with id:')
    })

    it("throws 'Checkout session is not open' when checkout session is not open", async () => {
      const checkoutSession = (
        await setupCheckoutSession({
          organizationId: morOrganization.id,
          customerId: morCustomer.id,
          priceId: morPrice.id,
          status: CheckoutSessionStatus.Succeeded,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: false,
        })
      ).unwrap()

      const billingAddress: BillingAddress = {
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return editCheckoutSessionBillingAddress(
            {
              checkoutSessionId: checkoutSession.id,
              billingAddress,
            },
            transaction
          )
        })
      ).rejects.toThrow('Checkout session is not open')
    })
  })
})

// Helper function to delete a fee calculation
async function deleteFeeCalculation(
  id: string,
  transaction: DbTransaction
) {
  // This is a placeholder - in a real implementation, you would use a proper delete method
  await transaction
    .delete(feeCalculations)
    .where(eq(feeCalculations.id, id))
}
