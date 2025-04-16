import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  FeeCalculationType,
  InvoiceStatus,
  PaymentMethodType,
  PaymentStatus,
  PurchaseStatus,
} from '@/types'
import {
  createFeeCalculationForCheckoutSession,
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
} from '../../../seedDatabase'
import { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import {
  safelyUpdateCheckoutSessionStatus,
  selectCheckoutSessionById,
} from '@/db/tableMethods/checkoutSessionMethods'
import { stripeIdFromObjectOrId } from '../stripe'
import core from '../core'
import Stripe from 'stripe'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import {
  FeeCalculation,
  feeCalculations,
} from '@/db/schema/feeCalculations'
import { Discount } from '@/db/schema/discounts'
import { updateFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { updatePurchase } from '@/db/tableMethods/purchaseMethods'
import { updatePaymentIntent } from '../stripe'
import { DbTransaction } from '@/db/types'
import { eq } from 'drizzle-orm'

// Helper functions to generate mock Stripe objects with random IDs
const mockSucceededCharge = (
  checkoutSessionId: string,
  stripeCustomerId: string,
  amount: number = 1000
): Stripe.Charge => ({
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
): Stripe.Charge => ({
  ...mockSucceededCharge(checkoutSessionId, stripeCustomerId, amount),
  id: `ch_${core.nanoid()}`,
  status: 'pending',
})

const mockFailedCharge = (
  checkoutSessionId: string,
  stripeCustomerId: string,
  amount: number = 1000
): Stripe.Charge => ({
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
  let succeededCharge: Stripe.Charge

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
      customer.stripeCustomerId!
    )
  })

  describe('createFeeCalculationForCheckoutSession', () => {
    it('should throw an error when organization country ID is missing', async () => {
      // Update organization to have no country ID
      await adminTransaction(async ({ transaction }) => {
        await updateOrg(
          {
            id: organization.id,
            countryId: null,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
        })
      ).rejects.toThrow('Organization country id is required')
    })

    it('should include discount when discountId is provided', async () => {
      // Update checkout session to include discount
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            discountId: discount.id,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const selectDiscountByIdSpy = vi.spyOn(
        require('@/db/tableMethods/discountMethods'),
        'selectDiscountById'
      )

      await adminTransaction(async ({ transaction }) => {
        return createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
      })

      expect(selectDiscountByIdSpy).toHaveBeenCalledWith(
        discount.id,
        expect.anything()
      )
    })

    it('should correctly fetch price, product, and organization data', async () => {
      const selectPriceProductAndOrganizationByPriceWhereSpy =
        vi.spyOn(
          require('@/db/tableMethods/priceMethods'),
          'selectPriceProductAndOrganizationByPriceWhere'
        )

      const selectCountryByIdSpy = vi.spyOn(
        require('@/db/tableMethods/countryMethods'),
        'selectCountryById'
      )

      await adminTransaction(async ({ transaction }) => {
        return createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
      })

      expect(
        selectPriceProductAndOrganizationByPriceWhereSpy
      ).toHaveBeenCalledWith(
        { id: checkoutSession.priceId },
        expect.anything()
      )

      expect(selectCountryByIdSpy).toHaveBeenCalledWith(
        organization.countryId,
        expect.anything()
      )
    })

    it('should create fee calculation with correct parameters', async () => {
      const createCheckoutSessionFeeCalculationSpy = vi.spyOn(
        require('./fees'),
        'createCheckoutSessionFeeCalculation'
      )

      await adminTransaction(async ({ transaction }) => {
        return createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
      })

      expect(
        createCheckoutSessionFeeCalculationSpy
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          checkoutSessionId: checkoutSession.id,
          billingAddress: checkoutSession.billingAddress,
          paymentMethodType: checkoutSession.paymentMethodType,
        }),
        expect.anything()
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
                billingAddress: newBillingAddress,
              } as CheckoutSession.Update,
            },
            transaction
          )
        }
      )

      expect(result.checkoutSession.billingAddress).toEqual(
        newBillingAddress
      )
    })

    it('should skip fee calculation when updated session is not fee-ready', async () => {
      // Update checkout session to be not fee-ready
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
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

      const createFeeCalculationForCheckoutSessionSpy = vi.spyOn(
        require('./checkoutSessions'),
        'createFeeCalculationForCheckoutSession'
      )

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: updatedCheckoutSession,
          },
          transaction
        )
      })

      expect(
        createFeeCalculationForCheckoutSessionSpy
      ).not.toHaveBeenCalled()
    })

    it('should create new fee calculation when fee parameters have changed', async () => {
      const createFeeCalculationForCheckoutSessionSpy = vi.spyOn(
        require('./checkoutSessions'),
        'createFeeCalculationForCheckoutSession'
      )

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
              billingAddress: newBillingAddress,
            } as CheckoutSession.Update,
          },
          transaction
        )
      })

      expect(
        createFeeCalculationForCheckoutSessionSpy
      ).toHaveBeenCalled()
    })

    it('should use existing fee calculation when parameters have not changed', async () => {
      const createFeeCalculationForCheckoutSessionSpy = vi.spyOn(
        require('./checkoutSessions'),
        'createFeeCalculationForCheckoutSession'
      )

      const selectLatestFeeCalculationSpy = vi.spyOn(
        require('@/db/tableMethods/feeCalculationMethods'),
        'selectLatestFeeCalculation'
      )

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: {
              id: checkoutSession.id,
            } as CheckoutSession.Update,
          },
          transaction
        )
      })

      expect(
        createFeeCalculationForCheckoutSessionSpy
      ).not.toHaveBeenCalled()
      expect(selectLatestFeeCalculationSpy).toHaveBeenCalledWith(
        { checkoutSessionId: checkoutSession.id },
        expect.anything()
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
              billingAddress: newBillingAddress,
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

      expect(updatedPurchase.billingAddress).toEqual(
        newBillingAddress
      )
    })

    it('should update Stripe payment intent with correct amount and fee when fee calculation exists and total due > 0', async () => {
      // Update checkout session to have a payment intent
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId: `pi_${core.nanoid()}`,
          },
          transaction
        )
      })

      const updatePaymentIntentSpy = vi.spyOn(
        require('../stripe'),
        'updatePaymentIntent'
      )

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: {
              id: checkoutSession.id,
            } as CheckoutSession.Update,
          },
          transaction
        )
      })

      expect(updatePaymentIntentSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          amount: expect.any(Number),
          application_fee_amount: expect.any(Number),
        }),
        expect.any(Boolean)
      )
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

      const updatePaymentIntentSpy = vi.spyOn(
        require('../stripe'),
        'updatePaymentIntent'
      )

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: {
              id: checkoutSession.id,
            } as CheckoutSession.Update,
          },
          transaction
        )
      })

      expect(updatePaymentIntentSpy).not.toHaveBeenCalled()
    })
  })

  describe('processPurchaseBookkeepingForCheckoutSession', () => {
    it('should use existing customer when linked to purchase', async () => {
      // Update checkout session to have a purchase ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
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
              stripeCustomerId: null,
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
              stripeCustomerId: null,
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

    it('should create new customer when no matching customer exists', async () => {
      // Update checkout session to have no customer ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const insertCustomerSpy = vi.spyOn(
        require('@/db/tableMethods/customerMethods'),
        'insertCustomer'
      )

      await adminTransaction(async ({ transaction }) => {
        return processPurchaseBookkeepingForCheckoutSession(
          {
            checkoutSession,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      expect(insertCustomerSpy).toHaveBeenCalled()
    })

    it('should create new Stripe customer when no Stripe customer ID is provided', async () => {
      // Update checkout session to have no customer ID
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: null,
          } as CheckoutSession.Update,
          transaction
        )
      })

      const createStripeCustomerSpy = vi.spyOn(
        require('../stripe'),
        'createStripeCustomer'
      )

      await adminTransaction(async ({ transaction }) => {
        return processPurchaseBookkeepingForCheckoutSession(
          {
            checkoutSession,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      expect(createStripeCustomerSpy).toHaveBeenCalled()
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

      const upsertPurchaseByIdSpy = vi.spyOn(
        require('@/db/tableMethods/purchaseMethods'),
        'upsertPurchaseById'
      )

      await adminTransaction(async ({ transaction }) => {
        return processPurchaseBookkeepingForCheckoutSession(
          {
            checkoutSession,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      expect(upsertPurchaseByIdSpy).toHaveBeenCalled()
    })

    it('should apply discount when fee calculation has a discount ID', async () => {
      // Update fee calculation to have a discount ID
      await adminTransaction(async ({ transaction }) => {
        await updateFeeCalculation(
          {
            ...feeCalculation,
            discountId: discount.id,
          },
          transaction
        )
      })

      const upsertDiscountRedemptionForPurchaseAndDiscountSpy =
        vi.spyOn(
          require('@/db/tableMethods/discountRedemptionMethods'),
          'upsertDiscountRedemptionForPurchaseAndDiscount'
        )

      await adminTransaction(async ({ transaction }) => {
        return processPurchaseBookkeepingForCheckoutSession(
          {
            checkoutSession,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      expect(
        upsertDiscountRedemptionForPurchaseAndDiscountSpy
      ).toHaveBeenCalled()
    })

    it('should link fee calculation to purchase record', async () => {
      const updateFeeCalculationSpy = vi.spyOn(
        require('@/db/tableMethods/feeCalculationMethods'),
        'updateFeeCalculation'
      )

      await adminTransaction(async ({ transaction }) => {
        return processPurchaseBookkeepingForCheckoutSession(
          {
            checkoutSession,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      expect(updateFeeCalculationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseId: expect.any(String),
          type: FeeCalculationType.CheckoutSessionPayment,
        }),
        expect.anything()
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
              stripeCustomerId: stripeIdFromObjectOrId(
                succeededCharge.customer!
              ),
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
    it('should throw "Invoice checkout flow does not support charges" when session type is not Invoice', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          return processStripeChargeForInvoiceCheckoutSession(
            {
              checkoutSession:
                checkoutSession as CheckoutSession.InvoiceRecord,
              charge: succeededCharge,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        'Invoice checkout flow does not support charges'
      )
    })

    it('should update checkout session status based on charge status', async () => {
      // Update checkout session to be an invoice type
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              priceId: null,
              purchaseId: null,
              outputMetadata: null,
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
              priceId: null,
              purchaseId: null,
              outputMetadata: null,
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
          stripePaymentIntentId: stripeIdFromObjectOrId(
            succeededCharge.payment_intent!
          ),
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

      expect(result.invoice.status).toEqual(InvoiceStatus.Paid)
    })

    it('should mark invoice as AwaitingPaymentConfirmation when charge is pending', async () => {
      // Update checkout session to be an invoice type
      const updatedCheckoutSession = await adminTransaction(
        async ({ transaction }) => {
          return updateCheckoutSession(
            {
              ...checkoutSession,
              priceId: null,
              purchaseId: null,
              outputMetadata: null,
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
              priceId: null,
              purchaseId: null,
              outputMetadata: null,
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
          stripePaymentIntentId: stripeIdFromObjectOrId(
            succeededCharge.payment_intent!
          ),
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
            priceId: null,
            purchaseId: null,
            outputMetadata: null,
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
      const createInitialInvoiceForPurchaseSpy = vi.spyOn(
        require('../bookkeeping'),
        'createInitialInvoiceForPurchase'
      )

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

      expect(result.purchase).toBeDefined()
      expect(result.invoice).toBeDefined()
      expect(createInitialInvoiceForPurchaseSpy).toHaveBeenCalled()
    })

    it('should skip bookkeeping and invoice creation for non-invoice sessions with Failed status', async () => {
      const failedCharge = mockFailedCharge(
        checkoutSession.id,
        customer.stripeCustomerId!
      )

      const createInitialInvoiceForPurchaseSpy = vi.spyOn(
        require('../bookkeeping'),
        'createInitialInvoiceForPurchase'
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
      expect(
        createInitialInvoiceForPurchaseSpy
      ).not.toHaveBeenCalled()
    })

    it('should update checkout session with customer information from charge', async () => {
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

      expect(result.checkoutSession.customerName).toEqual(
        succeededCharge.billing_details?.name
      )
      expect(result.checkoutSession.customerEmail).toEqual(
        succeededCharge.billing_details?.email
      )
    })
  })

  describe('Additional Business Logic Test Cases', () => {
    it('should handle partial payments correctly', async () => {
      // Update checkout session to be an invoice type
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            priceId: null,
            purchaseId: null,
            outputMetadata: null,
            type: CheckoutSessionType.Invoice,
            invoiceId: invoice.id,
          } as CheckoutSession.InvoiceUpdate,
          transaction
        )
      })

      // Create a payment that covers part of the invoice total
      await adminTransaction(async ({ transaction }) => {
        await setupPayment({
          invoiceId: invoice.id,
          amount: 500,
          status: PaymentStatus.Succeeded,
          livemode: true,
          paymentMethod: PaymentMethodType.Card,
          stripeChargeId: core.nanoid(),
          stripePaymentIntentId: stripeIdFromObjectOrId(
            succeededCharge.payment_intent!
          ),
          customerId: customer.id,
          organizationId: organization.id,
        })
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

      // The invoice should not be marked as paid yet
      expect(result.invoice?.status).not.toEqual(InvoiceStatus.Paid)

      // Create another payment that covers the rest of the invoice total
      await adminTransaction(async ({ transaction }) => {
        await setupPayment({
          invoiceId: invoice.id,
          amount: 500,
          status: PaymentStatus.Succeeded,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          stripeChargeId: succeededCharge.id,
          stripePaymentIntentId: stripeIdFromObjectOrId(
            succeededCharge.payment_intent!
          ),
          paymentMethod: PaymentMethodType.Card,
        })
      })

      const updatedInvoice = await adminTransaction(
        async ({ transaction }) => {
          return selectInvoiceById(invoice.id, transaction)
        }
      )

      // Now the invoice should be marked as paid
      expect(updatedInvoice.status).toEqual(InvoiceStatus.Paid)
    })

    it('should correctly calculate and apply fees in both test and live modes', async () => {
      // Create a fee calculation with a specific amount
      //   await adminTransaction(async ({ transaction }) => {
      //     await updateFeeCalculation(
      //       {
      //         ...feeCalculation,
      //         feeAmount: 100,
      //       } as FeeCalculation.Update,
      //       transaction
      //     )
      //   })

      // Update checkout session to have a payment intent
      await adminTransaction(async ({ transaction }) => {
        await updateCheckoutSession(
          {
            ...checkoutSession,
            stripePaymentIntentId: `pi_${core.nanoid()}`,
          },
          transaction
        )
      })

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: {
              id: checkoutSession.id,
            } as CheckoutSession.Update,
          },
          transaction
        )
      })

      // In test mode, application_fee_amount should be undefined
      expect(updatePaymentIntent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          amount: expect.any(Number),
          application_fee_amount: undefined,
        }),
        false
      )

      // Update fee calculation to be in live mode
      await adminTransaction(async ({ transaction }) => {
        await updateFeeCalculation(
          {
            ...feeCalculation,
            livemode: true,
          },
          transaction
        )
      })

      await adminTransaction(async ({ transaction }) => {
        return editCheckoutSession(
          {
            checkoutSession: {
              id: checkoutSession.id,
            } as CheckoutSession.Update,
          },
          transaction
        )
      })

      // In live mode, application_fee_amount should be set
      expect(updatePaymentIntent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          amount: expect.any(Number),
          application_fee_amount: expect.any(Number),
        }),
        true
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
async function updateOrg(org: any, transaction: any) {
  // This is a placeholder - in a real implementation, you would use a proper update method
  await transaction.query(
    'UPDATE organizations SET country_id = $1 WHERE id = $2',
    [org.countryId, org.id]
  )
}
