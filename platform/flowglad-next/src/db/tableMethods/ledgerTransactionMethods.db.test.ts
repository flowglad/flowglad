import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CurrencyCode,
  LedgerTransactionType,
  PriceType,
} from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Subscription } from '../schema/subscriptions'
import {
  insertLedgerTransaction,
  insertLedgerTransactionOrDoNothingByIdempotencyKey,
} from './ledgerTransactionMethods'

describe('Ledger Transaction Methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })
  })

  describe('insertLedgerTransaction', () => {
    it('should successfully insert ledger transaction and derive pricingModelId from subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerTransaction = await insertLedgerTransaction(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.CreditGrantRecognized,
            idempotencyKey: `idem_${core.nanoid()}`,
            metadata: {},
            livemode: true,
          },
          transaction
        )

        // Verify pricingModelId is correctly derived from subscription
        expect(ledgerTransaction.pricingModelId).toBe(
          subscription.pricingModelId
        )
        expect(ledgerTransaction.pricingModelId).toBe(pricingModel.id)
        expect(ledgerTransaction.subscriptionId).toBe(subscription.id)
      })
    })

    it('should throw an error when subscriptionId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`

        await expect(
          insertLedgerTransaction(
            {
              organizationId: organization.id,
              subscriptionId: nonExistentSubscriptionId,
              type: LedgerTransactionType.CreditGrantRecognized,
              idempotencyKey: `idem_${core.nanoid()}`,
              metadata: {},
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerTransaction = await insertLedgerTransaction(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.CreditGrantRecognized,
            idempotencyKey: `idem_${core.nanoid()}`,
            metadata: {},
            livemode: true,
            pricingModelId: pricingModel.id, // explicitly provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(ledgerTransaction.pricingModelId).toBe(pricingModel.id)
      })
    })
  })

  describe('insertLedgerTransactionOrDoNothingByIdempotencyKey', () => {
    it('should successfully insert ledger transaction with idempotency key and derive pricingModelId', async () => {
      await adminTransaction(async ({ transaction }) => {
        const idempotencyKey = `idem_${core.nanoid()}`
        const result = (
          await insertLedgerTransactionOrDoNothingByIdempotencyKey(
            {
              organizationId: organization.id,
              subscriptionId: subscription.id,
              type: LedgerTransactionType.CreditGrantRecognized,
              idempotencyKey,
              metadata: {},
              livemode: true,
            },
            transaction
          )
        ).unwrap()

        expect(result).toHaveLength(1)
        const ledgerTransaction = result[0]
        expect(ledgerTransaction.pricingModelId).toBe(
          subscription.pricingModelId
        )
        expect(ledgerTransaction.pricingModelId).toBe(pricingModel.id)
        expect(ledgerTransaction.idempotencyKey).toBe(idempotencyKey)
      })
    })

    it('should not insert duplicate when idempotency key already exists', async () => {
      await adminTransaction(async ({ transaction }) => {
        const idempotencyKey = `idem_${core.nanoid()}`

        // First insert
        const firstResult = (
          await insertLedgerTransactionOrDoNothingByIdempotencyKey(
            {
              organizationId: organization.id,
              subscriptionId: subscription.id,
              type: LedgerTransactionType.CreditGrantRecognized,
              idempotencyKey,
              metadata: {},
              livemode: true,
            },
            transaction
          )
        ).unwrap()

        expect(firstResult).toHaveLength(1)

        // Second insert with same idempotency key should do nothing
        const secondResult = (
          await insertLedgerTransactionOrDoNothingByIdempotencyKey(
            {
              organizationId: organization.id,
              subscriptionId: subscription.id,
              type: LedgerTransactionType.CreditGrantRecognized,
              idempotencyKey, // same idempotency key
              metadata: {},
              livemode: true,
            },
            transaction
          )
        ).unwrap()

        expect(secondResult).toHaveLength(0)
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const idempotencyKey = `idem_${core.nanoid()}`
        const result = (
          await insertLedgerTransactionOrDoNothingByIdempotencyKey(
            {
              organizationId: organization.id,
              subscriptionId: subscription.id,
              type: LedgerTransactionType.CreditGrantRecognized,
              idempotencyKey,
              metadata: {},
              livemode: true,
              pricingModelId: pricingModel.id, // explicitly provided
            },
            transaction
          )
        ).unwrap()

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
      })
    })
  })
})
