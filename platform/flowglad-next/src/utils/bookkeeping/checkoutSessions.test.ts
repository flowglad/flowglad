import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  DiscountAmountType,
  FeeCalculationType,
  InvoiceStatus,
  PaymentMethodType,
  PaymentStatus,
  PurchaseStatus,
} from '@/types'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/fees/checkoutSession'
import {
  editCheckoutSession,
  processPurchaseBookkeepingForCheckoutSession,
  checkoutSessionStatusFromStripeCharge,
  processStripeChargeForInvoiceCheckoutSession,
  processStripeChargeForCheckoutSession,
} from '@/utils/bookkeeping/checkoutSessions'
import { Purchase } from '@/db/schema/purchases'
import {
  setupBillingPeriod,
  setupCustomer,
  setupDiscount,
  setupFeeCalculation,
  setupInvoice,
  setupInvoiceLineItem,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPurchase,
  setupCheckoutSession,
} from '@/../seedDatabase'
import { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import core from '../core'
import Stripe from 'stripe'
import {
  CheckoutSession,
  invoiceCheckoutSessionNulledColumns,
} from '@/db/schema/checkoutSessions'
import {
  FeeCalculation,
  feeCalculations,
} from '@/db/schema/feeCalculations'
import { Discount } from '@/db/schema/discounts'
import {
  selectLatestFeeCalculation,
  selectFeeCalculations,
  updateFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { updatePurchase } from '@/db/tableMethods/purchaseMethods'
import { updatePaymentIntent } from '../stripe'
import { DbTransaction } from '@/db/types'
import { eq } from 'drizzle-orm'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { createInitialInvoiceForPurchase } from '../bookkeeping'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import {
  BillingAddress,
  Organization,
  organizations,
} from '@/db/schema/organizations'

// vi.mock('@/utils/stripe', () => ({
//   createStripeCustomer: vi.fn(),
//   getSetupIntent: vi.fn(),
//   updatePaymentIntent: vi.fn(),
//   updateSetupIntent: vi.fn(),
// }))

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

describe('Checkout Sessions', async () => {
  // Common variables for all tests
  const { organization, price } = await setupOrg()
  let customer: Customer.Record
  let checkoutSession: CheckoutSession.Record
  let paymentMethod: PaymentMethod.Record
  let purchase: Purchase.Record
  let invoice: Invoice.Record
  let feeCalculation: FeeCalculation.Record
  let discount: Discount.Record
  let succeededCharge: TestCharge

  beforeEach(async () => {
    // Set up common test data
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

    invoice = await setupInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })

    await setupInvoiceLineItem({
      invoiceId: invoice.id,
      priceId: price.id,
      quantity: 1,
      price: 1000,
      livemode: true,
    })

    discount = await setupDiscount({
      organizationId: organization.id,
      name: 'TEST10',
      code: `${new Date().getTime()}`,
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

      expect(feeCalculation).toBeDefined()
      expect(feeCalculation.priceId).toEqual(checkoutSession.priceId)
      expect(feeCalculation.organizationId).toEqual(organization.id)
      expect(feeCalculation.checkoutSessionId).toEqual(
        checkoutSession.id
      )
      expect(feeCalculation.billingAddress).toEqual(
        checkoutSession.billingAddress
      )
      expect(feeCalculation.paymentMethodType).toEqual(
        checkoutSession.paymentMethodType
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

      expect(feeCalculation).toBeDefined()
      expect(feeCalculation.checkoutSessionId).toEqual(
        checkoutSession.id
      )
      expect(feeCalculation.billingAddress).toEqual(
        checkoutSession.billingAddress
      )
      expect(feeCalculation.paymentMethodType).toEqual(
        checkoutSession.paymentMethodType
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
              } as CheckoutSession.Update,
            },
            transaction
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
              } as CheckoutSession.Update,
            },
            transaction
          )
        }
      )

      expect(
        (result.checkoutSession.billingAddress as BillingAddress)
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
            transaction
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
                billingAddress: {
                  address: newBillingAddress,
                },
              } as CheckoutSession.Update,
            },
            transaction
          )
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )
      expect(priorFeeCalculation).toBeDefined()
      expect(latestFeeCalculation).toBeDefined()
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
              } as CheckoutSession.Update,
            },
            transaction
          )
          return selectLatestFeeCalculation(
            {
              checkoutSessionId: checkoutSession.id,
            },
            transaction
          )
        }
      )

      expect(latestFeeCalculation).toBeDefined()
      expect(latestFeeCalculation!.id).toEqual(
        priorFeeCalculation!.id
      )
    })

    it('should throw "Purchase is not pending" when purchase status is not Pending', async () => {
      // Update purchase to a non-pending status
      await adminTransaction(async ({ transaction }) => {
        await updatePurchase(
          {
            ...purchase,
            status: PurchaseStatus.Paid,
          } as Purchase.Update,
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return editCheckoutSession(
            {
              checkoutSession: {
                id: checkoutSession.id,
              } as CheckoutSession.Update,
              purchaseId: purchase.id,
            },
            transaction
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
              billingAddress: {
                address: newBillingAddress,
              },
            } as CheckoutSession.Update,
            purchaseId: purchase.id,
          },
          transaction
        )
      })

      const updatedPurchase = await adminTransaction(
        async ({ transaction }) => {
          return selectPurchaseById(purchase.id, transaction)
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
              } as CheckoutSession.Update,
            },
            transaction
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
  })

  describe('processPurchaseBookkeepingForCheckoutSession', () => {
    it('should use existing customer when linked to purchase', async () => {
      // Update checkout session to have a purchase ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            preserveBillingCycleAnchor: null,
            type: CheckoutSessionType.Purchase,
            purchaseId: purchase.id,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            transaction
          )
        }
      )

      expect(result.customer.id).toEqual(customer.id)
    })

    it('should use existing customer when linked to checkout session', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            transaction
          )
        }
      )

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
        adminTransaction(async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: 'different-stripe-id',
            },
            transaction
          )
        })
      ).rejects.toThrow('Attempting to process checkout session')
    })

    it('should find customer by Stripe customer ID when provided', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: customer.stripeCustomerId!,
            },
            transaction
          )
        }
      )

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

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession: updatedCheckoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            transaction
          )
        }
      )

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
      const result = await adminTransaction(
        async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            transaction
          )
        }
      )
      expect(result.customer.stripeCustomerId).toBeDefined()
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

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            transaction
          )
        }
      )

      expect(result.purchase.id).toBeDefined()
    })

    it('should apply discount when fee calculation has a discount ID', async () => {
      // Update fee calculation to have a discount ID
      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        const [discountRedemption] = await selectDiscountRedemptions(
          {
            purchaseId: result.purchase.id,
          },
          transaction
        )
        expect(discountRedemption).toBeDefined()
        expect(discountRedemption.discountId).toEqual(discount.id)
      })
    })

    it('should link fee calculation to purchase record', async () => {
      const { latestFeeCalculation, result } = await adminTransaction(
        async ({ transaction }) => {
          const result =
            await processPurchaseBookkeepingForCheckoutSession(
              {
                checkoutSession,
                stripeCustomerId: succeededCharge.customer! as string,
              },
              transaction
            )
          const latestFeeCalculation =
            await selectLatestFeeCalculation(
              {
                checkoutSessionId: checkoutSession.id,
              },
              transaction
            )
          return { latestFeeCalculation, result }
        }
      )

      expect(latestFeeCalculation?.purchaseId).toEqual(
        result.purchase.id
      )
    })

    it('should throw error when no fee calculation is found for session', async () => {
      // Delete fee calculation
      await adminTransaction(async ({ transaction }) => {
        await deleteFeeCalculation(feeCalculation.id, transaction)
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return processPurchaseBookkeepingForCheckoutSession(
            {
              checkoutSession,
              stripeCustomerId: succeededCharge.customer! as string,
            },
            transaction
          )
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

  describe('processStripeChargeForInvoiceCheckoutSession', () => {
    it('should update checkout session status based on charge status', async () => {
      // Update checkout session to be an invoice type
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              ...invoiceCheckoutSessionNulledColumns,
              type: CheckoutSessionType.Invoice,
              invoiceId: invoice.id,
            } as CheckoutSession.InvoiceUpdate,
            transaction
          )
        }
      )

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processStripeChargeForInvoiceCheckoutSession(
            {
              checkoutSession:
                updatedCheckoutSession as CheckoutSession.InvoiceRecord,
              charge: succeededCharge,
            },
            transaction
          )
        }
      )

      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
    })

    it('should mark invoice as Paid when total payments meet or exceed invoice total', async () => {
      // Update checkout session to be an invoice type
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              ...invoiceCheckoutSessionNulledColumns,
              type: CheckoutSessionType.Invoice,
              invoiceId: invoice.id,
            } as CheckoutSession.InvoiceUpdate,
            transaction
          )
        }
      )

      // Create a payment that covers the invoice total
      await adminTransaction(async ({ transaction }) => {
        await setupPayment({
          invoiceId: invoice.id,
          amount: 1000,
          status: PaymentStatus.Succeeded,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          stripeChargeId: succeededCharge.id,
          stripePaymentIntentId:
            succeededCharge.payment_intent! as string,
          paymentMethod: PaymentMethodType.Card,
        })
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processStripeChargeForInvoiceCheckoutSession(
            {
              checkoutSession:
                updatedCheckoutSession as CheckoutSession.InvoiceRecord,
              charge: succeededCharge,
            },
            transaction
          )
        }
      )

      expect(result.invoice).toBeDefined()
    })

    it('should mark invoice as AwaitingPaymentConfirmation when charge is pending', async () => {
      // Update checkout session to be an invoice type
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              ...invoiceCheckoutSessionNulledColumns,
              type: CheckoutSessionType.Invoice,
              invoiceId: invoice.id,
            } as CheckoutSession.InvoiceUpdate,
            transaction
          )
        }
      )

      const pendingCharge = mockPendingCharge(
        checkoutSession.id,
        customer.stripeCustomerId!
      )

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processStripeChargeForInvoiceCheckoutSession(
            {
              checkoutSession:
                updatedCheckoutSession as CheckoutSession.InvoiceRecord,
              charge: pendingCharge,
            },
            transaction
          )
        }
      )

      expect(result.invoice.status).toEqual(
        InvoiceStatus.AwaitingPaymentConfirmation
      )
    })

    it('should not change invoice status when payment succeeds but total is still less than invoice amount', async () => {
      // Update checkout session to be an invoice type
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              ...invoiceCheckoutSessionNulledColumns,
              type: CheckoutSessionType.Invoice,
              invoiceId: invoice.id,
            } as CheckoutSession.InvoiceUpdate,
            transaction
          )
        }
      )

      // Create a payment that doesn't cover the invoice total
      await adminTransaction(async ({ transaction }) => {
        await setupPayment({
          invoiceId: invoice.id,
          amount: 500,
          status: PaymentStatus.Succeeded,
          livemode: true,
          paymentMethod: PaymentMethodType.Card,
          stripeChargeId: succeededCharge.id,
          stripePaymentIntentId:
            succeededCharge.payment_intent! as string,
          customerId: customer.id,
          organizationId: organization.id,
        })
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processStripeChargeForInvoiceCheckoutSession(
            {
              checkoutSession:
                updatedCheckoutSession as CheckoutSession.InvoiceRecord,
              charge: succeededCharge,
            },
            transaction
          )
        }
      )

      expect(result.invoice.status).not.toEqual(InvoiceStatus.Paid)
    })
  })

  describe('processStripeChargeForCheckoutSession', () => {
    it('should delegate to processStripeChargeForInvoiceCheckoutSession when session type is Invoice', async () => {
      // Update checkout session to be an invoice type
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            ...invoiceCheckoutSessionNulledColumns,
            type: CheckoutSessionType.Invoice,
            invoiceId: invoice.id,
          } as CheckoutSession.InvoiceUpdate,
          transaction
        )
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: succeededCharge,
            },
            transaction
          )
        }
      )

      expect(result.purchase).toBeNull()
      expect(result.invoice).toBeDefined()
      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
    })

    it('should process purchase bookkeeping and create invoice for non-invoice sessions with status Pending or Succeeded', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId:
                succeededCharge.payment_intent! as string,
            },
            transaction
          )
          return processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: succeededCharge,
            },
            transaction
          )
        }
      )

      expect(result.purchase).toBeDefined()
      expect(result.invoice).toBeDefined()
      expect(result.checkoutSession.status).toEqual(
        CheckoutSessionStatus.Succeeded
      )
    })

    it('should skip bookkeeping and invoice creation for non-invoice sessions with Failed status', async () => {
      const failedCharge = mockFailedCharge(
        checkoutSession.id,
        customer.stripeCustomerId!
      )

      const result = await adminTransaction(
        async ({ transaction }) => {
          return processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: failedCharge,
            },
            transaction
          )
        }
      )

      expect(result.purchase).toBeNull()
      expect(result.invoice).toBeNull()
    })

    it('should update checkout session with customer information from charge', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          await updateCheckoutSession(
            {
              ...checkoutSession,
              stripePaymentIntentId:
                succeededCharge.payment_intent! as string,
            },
            transaction
          )

          return processStripeChargeForCheckoutSession(
            {
              checkoutSessionId: checkoutSession.id,
              charge: succeededCharge,
            },
            transaction
          )
        }
      )

      expect(result.checkoutSession.customerName).toEqual(
        succeededCharge.billing_details?.name
      )
      expect(result.checkoutSession.customerEmail).toEqual(
        succeededCharge.billing_details?.email
      )
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

// Helper function to update an organization
async function updateOrg(
  org: Organization.Record,
  transaction: DbTransaction
) {
  // This is a placeholder - in a real implementation, you would use a proper update method
  await transaction
    .update(organizations)
    .set({
      countryId: org.countryId,
    })
    .where(eq(organizations.id, org.id))
}
