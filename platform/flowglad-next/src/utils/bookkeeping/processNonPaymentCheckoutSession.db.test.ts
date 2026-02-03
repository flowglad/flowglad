import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  DiscountAmountType,
  PriceType,
  PurchaseStatus,
} from '@db-core/enums'
import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { Result } from 'better-result'
import {
  setupCheckoutSession,
  setupCustomer,
  setupDiscount,
  setupOrg,
  setupPrice,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { updateCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { createProcessingEffectsContext } from '@/test-utils/transactionCallbacks'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/fees/checkoutSession'
import { processNonPaymentCheckoutSession } from '@/utils/bookkeeping/processNonPaymentCheckoutSession'
import core from '@/utils/core'

describe('processNonPaymentCheckoutSession', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let checkoutSession: CheckoutSession.Record

  let pricingModel: Awaited<
    ReturnType<typeof setupOrg>
  >['pricingModel']

  beforeEach(async () => {
    const setupData = await setupOrg()
    organization = setupData.organization
    product = setupData.product
    pricingModel = setupData.pricingModel

    // Create a single payment price (not subscription) since processNonPaymentCheckoutSession
    // does not support subscriptions
    price = await setupPrice({
      productId: product.id,
      name: 'Single Payment Price',
      type: PriceType.SinglePayment,
      unitPrice: 10000, // $100.00
      livemode: true,
      isDefault: false,
    })

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
        pricingModelId: pricingModel.id,
        name: 'FULL100',
        code: core.nanoid().slice(0, 10),
        amount: price.unitPrice, // Full price coverage
        amountType: DiscountAmountType.Fixed,
        livemode: true,
      })

      // Update checkout session to include the full discount
      const updatedCheckoutSession = (
        await adminTransaction(async ({ transaction }) => {
          const result = await updateCheckoutSession(
            {
              ...checkoutSession,
              discountId: fullDiscount.id,
            } as CheckoutSession.Update,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Create fee calculation with the discount applied
      ;(
        await adminTransaction(async ({ transaction }) => {
          const result = await createFeeCalculationForCheckoutSession(
            updatedCheckoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Process the non-payment checkout session
      const result = (
        await adminTransaction(async (params) => {
          return Result.ok(
            await processNonPaymentCheckoutSession(
              updatedCheckoutSession,
              createProcessingEffectsContext(params)
            )
          )
        })
      ).unwrap()

      // Verify purchase status is Paid
      expect(result.purchase.status).toEqual(PurchaseStatus.Paid)

      // Verify purchaseDate is set (not null)
      expect(typeof result.purchase.purchaseDate).toBe('number')

      // Verify purchaseDate is a recent timestamp (within the last minute)
      const purchaseDateTimestamp = result.purchase.purchaseDate!
      const now = Date.now()
      const oneMinuteAgo = now - 60000
      expect(purchaseDateTimestamp).toBeGreaterThanOrEqual(
        oneMinuteAgo
      )
      expect(purchaseDateTimestamp).toBeLessThanOrEqual(now)

      // Verify invoice is created
      expect(result.invoice).toMatchObject({})
      expect(result.invoice.purchaseId).toEqual(result.purchase.id)
    })

    it('throws error when total due is not zero', async () => {
      // Create fee calculation without discount (non-zero total)
      ;(
        await adminTransaction(async ({ transaction }) => {
          const result = await createFeeCalculationForCheckoutSession(
            checkoutSession as CheckoutSession.FeeReadyRecord,
            transaction
          )
          return Result.ok(result)
        })
      ).unwrap()

      // Attempt to process non-payment checkout should fail
      const result = await adminTransaction(async (params) => {
        try {
          await processNonPaymentCheckoutSession(
            checkoutSession,
            createProcessingEffectsContext(params)
          )
          return Result.ok('should have thrown')
        } catch (error) {
          return Result.err(error as Error)
        }
      })
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Total due for purchase session'
        )
      }
    })
  })
})
