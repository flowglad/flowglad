import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupDiscount,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPurchase,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { DiscountRedemption } from '@/db/schema/discountRedemptions'
import type { Discount } from '@/db/schema/discounts'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Purchase } from '@/db/schema/purchases'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  insertDiscountRedemption,
  selectDiscountRedemptions,
} from '@/db/tableMethods/discountRedemptionMethods'
import {
  DiscountAmountType,
  DiscountDuration,
  PaymentMethodType,
  PaymentStatus,
} from '@/types'
import {
  incrementNumberOfPaymentsForDiscountRedemption,
  safelyIncrementDiscountRedemptionSubscriptionPayment,
} from '@/utils/bookkeeping/discountRedemptionTracking'
import { core } from '@/utils/core'

describe('Discount Redemption Tracking', () => {
  // Common variables for all tests
  let organization: Organization.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let discount: Discount.Record
  let discountRedemption: DiscountRedemption.Record
  let invoice: Invoice.Record
  let purchase: Purchase.Record
  beforeEach(async () => {
    // Set up common test data
    const setupResult = await setupOrg()
    organization = setupResult.organization
    price = setupResult.price

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

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      livemode: true,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    discount = await setupDiscount({
      organizationId: organization.id,
      name: 'Test Discount',
      amount: 10,
      code: 'TEST10',
      amountType: DiscountAmountType.Percent,
      livemode: true,
    })
    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })
  })

  describe('incrementNumberOfPaymentsForDiscountRedemption', () => {
    it('should increment numberOfPaymentsMade when numberOfPayments is not set', async () => {
      // Create a discount redemption with NumberOfPayments duration
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 1,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a payment
      const payment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
      })

      // Call the function
      await adminTransaction(async ({ transaction }) => {
        await incrementNumberOfPaymentsForDiscountRedemption(
          discountRedemption,
          payment,
          transaction
        )
      })

      // Verify the discount redemption was not marked as fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(true)
    })

    it('does not mark as fully redeemed when payment is the first successful payment', async () => {
      // Create a discount redemption with numberOfPayments = 3
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 3,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a payment
      const payment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
      })

      // Call the function
      await adminTransaction(async ({ transaction }) => {
        await incrementNumberOfPaymentsForDiscountRedemption(
          discountRedemption,
          payment,
          transaction
        )
      })

      // Verify the discount redemption was not marked as fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(false)
    })

    it('marks as fully redeemed when payment is the last payment needed', async () => {
      // Create a discount redemption with numberOfPayments = 2
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 2,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a first payment
      const firstPayment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Create a second payment
      const secondPayment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function with the second payment
      await adminTransaction(async ({ transaction }) => {
        await incrementNumberOfPaymentsForDiscountRedemption(
          discountRedemption,
          secondPayment,
          transaction
        )
      })

      // Verify the discount redemption was marked as fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(true)
    })

    it('marks as fully redeemed when payment is beyond the required number', async () => {
      // Create a discount redemption with numberOfPayments = 1
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 1,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a first payment
      const firstPayment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Create a second payment
      const secondPayment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function with the second payment
      await adminTransaction(async ({ transaction }) => {
        await incrementNumberOfPaymentsForDiscountRedemption(
          discountRedemption,
          secondPayment,
          transaction
        )
      })

      // Verify the discount redemption was marked as fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(true)
    })

    it('does not count payments for other purchases when subscriptionId is null', async () => {
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: null,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 2,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      const otherCustomer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: `cus_${core.nanoid()}`,
      })
      const otherInvoice = await setupInvoice({
        organizationId: organization.id,
        customerId: otherCustomer.id,
        priceId: price.id,
      })
      const otherPurchase = await setupPurchase({
        organizationId: organization.id,
        customerId: otherCustomer.id,
        priceId: price.id,
      })

      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: otherCustomer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: otherInvoice.id,
        paymentMethod: PaymentMethodType.Card,
        purchaseId: otherPurchase.id,
      })
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: otherCustomer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: otherInvoice.id,
        paymentMethod: PaymentMethodType.Card,
        purchaseId: otherPurchase.id,
      })
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: otherCustomer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: otherInvoice.id,
        paymentMethod: PaymentMethodType.Card,
        purchaseId: otherPurchase.id,
      })

      const paymentForDiscountRedemptionPurchase = await setupPayment(
        {
          stripeChargeId: `ch_${core.nanoid()}`,
          status: PaymentStatus.Succeeded,
          amount: 1000,
          customerId: customer.id,
          organizationId: organization.id,
          stripePaymentIntentId: `pi_${core.nanoid()}`,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
          purchaseId: purchase.id,
        }
      )

      await adminTransaction(async ({ transaction }) => {
        await incrementNumberOfPaymentsForDiscountRedemption(
          discountRedemption,
          paymentForDiscountRedemptionPurchase,
          transaction
        )
      })

      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(false)
    })
  })

  describe('safelyIncrementDiscountRedemptionSubscriptionPayment', () => {
    // it('returns early when payment has no subscriptionId or purchaseId', async () => {
    //   // Create a payment without subscriptionId or purchaseId
    //   const payment = await setupPayment({
    //     stripeChargeId: `ch_${core.nanoid()}`,
    //     status: PaymentStatus.Succeeded,
    //     amount: 1000,
    //     customerId: customer.id,
    //     organizationId: organization.id,
    //     stripePaymentIntentId: `pi_${core.nanoid()}`,
    //     invoiceId: invoice.id,
    //     paymentMethod: PaymentMethodType.Card,
    //   })

    //   // Call the function
    //   await adminTransaction(async ({ transaction }) => {
    //     await safelyIncrementDiscountRedemptionSubscriptionPayment(
    //       payment,
    //       transaction
    //     )
    //   })

    //   // Verify no discount redemption was created
    //   const discountRedemptions = await adminTransaction(
    //     async ({ transaction }) => {
    //       return await selectDiscountRedemptions({}, transaction)
    //     }
    //   )

    //   expect(discountRedemptions).toHaveLength(0)
    // })

    // it('returns early when no discount redemption exists', async () => {
    //   // Create a payment with subscriptionId
    //   const payment = await setupPayment({
    //     stripeChargeId: `ch_${core.nanoid()}`,
    //     status: PaymentStatus.Succeeded,
    //     amount: 1000,
    //     customerId: customer.id,
    //     organizationId: organization.id,
    //     stripePaymentIntentId: `pi_${core.nanoid()}`,
    //     invoiceId: invoice.id,
    //     paymentMethod: PaymentMethodType.Card,
    //     subscriptionId: subscription.id,
    //   })

    //   // Call the function
    //   await adminTransaction(async ({ transaction }) => {
    //     await safelyIncrementDiscountRedemptionSubscriptionPayment(
    //       payment,
    //       transaction
    //     )
    //   })

    //   // Verify no discount redemption was created
    //   const discountRedemptions = await adminTransaction(
    //     async ({ transaction }) => {
    //       return await selectDiscountRedemptions(
    //         {
    //           purchaseId: purchase.id,
    //         },
    //         transaction
    //       )
    //     }
    //   )

    //   expect(discountRedemptions).toHaveLength(0)
    // })

    it('returns early when discount redemption is already fully redeemed', async () => {
      // Create a discount redemption that is already fully redeemed
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 2,
            livemode: true,
            fullyRedeemed: true,
          },
          transaction
        )
      })

      // Create a payment
      const payment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function
      await adminTransaction(async ({ transaction }) => {
        await safelyIncrementDiscountRedemptionSubscriptionPayment(
          payment,
          transaction
        )
      })

      // Verify the discount redemption is still fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(true)
    })

    it('returns early when discount duration is Forever', async () => {
      // Create a discount redemption with Forever duration
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.Forever,
            numberOfPayments: null,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a payment
      const payment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function
      await adminTransaction(async ({ transaction }) => {
        await safelyIncrementDiscountRedemptionSubscriptionPayment(
          payment,
          transaction
        )
      })

      // Verify the discount redemption is not fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(false)
    })

    it('marks as fully redeemed when discount duration is Once', async () => {
      // Create a discount redemption with Once duration
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.Once,
            numberOfPayments: null,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a payment
      const payment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function
      await adminTransaction(async ({ transaction }) => {
        await safelyIncrementDiscountRedemptionSubscriptionPayment(
          payment,
          transaction
        )
      })

      // Verify the discount redemption is fully redeemed
      const updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(true)
    })

    it('increments number of payments when discount duration is NumberOfPayments', async () => {
      // Create a discount redemption with NumberOfPayments duration
      await adminTransaction(async ({ transaction }) => {
        discountRedemption = await insertDiscountRedemption(
          {
            discountId: discount.id,
            purchaseId: purchase.id,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
            subscriptionId: subscription.id,
            duration: DiscountDuration.NumberOfPayments,
            numberOfPayments: 2,
            livemode: true,
            fullyRedeemed: false,
          },
          transaction
        )
      })

      // Create a first payment
      const firstPayment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function with the first payment
      await adminTransaction(async ({ transaction }) => {
        await safelyIncrementDiscountRedemptionSubscriptionPayment(
          firstPayment,
          transaction
        )
      })

      // Verify the discount redemption is not fully redeemed after first payment
      let updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(false)

      // Create a second payment
      const secondPayment = await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 1000,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: `pi_${core.nanoid()}`,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        subscriptionId: subscription.id,
      })

      // Call the function with the second payment
      await adminTransaction(async ({ transaction }) => {
        await safelyIncrementDiscountRedemptionSubscriptionPayment(
          secondPayment,
          transaction
        )
      })

      // Verify the discount redemption is fully redeemed after second payment
      updatedDiscountRedemption = await adminTransaction(
        async ({ transaction }) => {
          const [redemption] = await selectDiscountRedemptions(
            { id: discountRedemption.id },
            transaction
          )
          return redemption
        }
      )

      expect(updatedDiscountRedemption.fullyRedeemed).toBe(true)
    })
  })
})
