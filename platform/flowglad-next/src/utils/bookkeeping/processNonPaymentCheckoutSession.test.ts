import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCheckoutSession,
  setupCustomer,
  setupDiscount,
  setupOrg,
} from '@/../seedDatabase'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  DiscountAmountType,
  PurchaseStatus,
} from '@/types'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/fees/checkoutSession'
import { processNonPaymentCheckoutSession } from '@/utils/bookkeeping/processNonPaymentCheckoutSession'
import core from '@/utils/core'

describe('processNonPaymentCheckoutSession', () => {
  let organization: Organization.Record
  let price: Price.Record
  let customer: Customer.Record
  let checkoutSession: CheckoutSession.Record

  beforeEach(async () => {
    const setupData = await setupOrg()
    organization = setupData.organization
    price = setupData.price

    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
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
  })

  describe('Purchase State for Zero-Total Checkouts', () => {
    it('sets purchase status to Paid and purchaseDate when processing a zero-total checkout with 100% discount', async () => {
      // Create a 100% off discount that equals the full price amount
      const fullDiscount = await setupDiscount({
        organizationId: organization.id,
        name: 'FULL100',
        code: core.nanoid().slice(0, 10),
        amount: price.unitPrice, // Full price coverage
        amountType: DiscountAmountType.Fixed,
        livemode: true,
      })

      // Update checkout session to include the full discount
      const updatedCheckoutSession =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const result = await updateCheckoutSession(
              {
                ...checkoutSession,
                discountId: fullDiscount.id,
              } as CheckoutSession.Update,
              transaction
            )
            return { result }
          }
        )

      // Create fee calculation with the discount applied
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await createFeeCalculationForCheckoutSession(
          updatedCheckoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        return { result }
      })

      // Process the non-payment checkout session
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return processNonPaymentCheckoutSession(
            updatedCheckoutSession,
            transaction
          )
        }
      )

      // Verify purchase status is Paid
      expect(result.purchase.status).toEqual(PurchaseStatus.Paid)

      // Verify purchaseDate is set (not null)
      expect(result.purchase.purchaseDate).not.toBeNull()

      // Verify purchaseDate is a recent timestamp (within the last minute)
      const purchaseDateTimestamp = result.purchase.purchaseDate!
      const now = Date.now()
      const oneMinuteAgo = now - 60000
      expect(purchaseDateTimestamp).toBeGreaterThanOrEqual(
        oneMinuteAgo
      )
      expect(purchaseDateTimestamp).toBeLessThanOrEqual(now)

      // Verify invoice is created
      expect(result.invoice).not.toBeNull()
      expect(result.invoice.purchaseId).toEqual(result.purchase.id)
    })

    it('throws error when total due is not zero', async () => {
      // Create fee calculation without discount (non-zero total)
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const result = await createFeeCalculationForCheckoutSession(
          checkoutSession as CheckoutSession.FeeReadyRecord,
          transaction
        )
        return { result }
      })

      // Attempt to process non-payment checkout should fail
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return processNonPaymentCheckoutSession(
            checkoutSession,
            transaction
          )
        })
      ).rejects.toThrow('Total due for purchase session')
    })
  })
})
