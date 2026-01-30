import { beforeEach, describe, expect, it } from 'bun:test'
import {
  EventNoun,
  FlowgladEventType,
  InvoiceStatus,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Invoice } from '@db-core/schema/invoices'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Payment } from '@db-core/schema/payments'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Purchase } from '@db-core/schema/purchases'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupPurchase,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import core from '@/utils/core'
import {
  bulkInsertOrDoNothingEventsByHash,
  derivePricingModelIdFromEventPayload,
  pricingModelIdsForEventPayloads,
  selectEventById,
} from './eventMethods'

describe('pricingModelIdsForEventPayloads', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let payment: Payment.Record
  let purchase: Purchase.Record
  let invoice: Invoice.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${Date.now()}@test.com`,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })

    payment = await setupPayment({
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 1000,
      status: PaymentStatus.Succeeded,
      stripeChargeId: `ch_${core.nanoid()}`,
      livemode: true,
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })
  })

  it('returns an empty map when given an empty payloads array', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [],
          transaction
        )

        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(0)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a customer payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [{ id: customer.id, object: EventNoun.Customer }],
          transaction
        )

        expect(result.size).toBe(1)
        expect(result.get(customer.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a subscription payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [{ id: subscription.id, object: EventNoun.Subscription }],
          transaction
        )

        expect(result.size).toBe(1)
        expect(result.get(subscription.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a payment payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [{ id: payment.id, object: EventNoun.Payment }],
          transaction
        )

        expect(result.size).toBe(1)
        expect(result.get(payment.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a purchase payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [{ id: purchase.id, object: EventNoun.Purchase }],
          transaction
        )

        expect(result.size).toBe(1)
        expect(result.get(purchase.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelIds for multiple payloads of different types', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [
            { id: customer.id, object: EventNoun.Customer },
            { id: subscription.id, object: EventNoun.Subscription },
            { id: payment.id, object: EventNoun.Payment },
            { id: purchase.id, object: EventNoun.Purchase },
          ],
          transaction
        )

        expect(result.size).toBe(4)
        expect(result.get(customer.id)).toBe(pricingModel.id)
        expect(result.get(subscription.id)).toBe(pricingModel.id)
        expect(result.get(payment.id)).toBe(pricingModel.id)
        expect(result.get(purchase.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelIds for multiple payloads of the same type', async () => {
    const customer2 = await setupCustomer({
      organizationId: organization.id,
      email: `test2+${Date.now()}@test.com`,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [
            { id: customer.id, object: EventNoun.Customer },
            { id: customer2.id, object: EventNoun.Customer },
          ],
          transaction
        )

        expect(result.size).toBe(2)
        expect(result.get(customer.id)).toBe(pricingModel.id)
        expect(result.get(customer2.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('does not include non-existent IDs in the result map', async () => {
    const nonExistentId = `cust_${core.nanoid()}`

    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await pricingModelIdsForEventPayloads(
          [
            { id: nonExistentId, object: EventNoun.Customer },
            { id: customer.id, object: EventNoun.Customer },
          ],
          transaction
        )

        expect(result.size).toBe(1)
        expect(result.has(nonExistentId)).toBe(false)
        expect(result.get(customer.id)).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('handles unsupported EventNoun types by not including them in query results', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        // User and Product are EventNoun values that aren't queried by this function
        const result = await pricingModelIdsForEventPayloads(
          [
            { id: 'user_123', object: EventNoun.User },
            { id: 'prod_123', object: EventNoun.Product },
            { id: customer.id, object: EventNoun.Customer },
          ],
          transaction
        )

        // Only the customer should be in the result
        expect(result.size).toBe(1)
        expect(result.get(customer.id)).toBe(pricingModel.id)
        expect(result.has('user_123')).toBe(false)
        expect(result.has('prod_123')).toBe(false)
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})

describe('derivePricingModelIdFromEventPayload', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let payment: Payment.Record
  let purchase: Purchase.Record
  let invoice: Invoice.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${Date.now()}@test.com`,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })

    payment = await setupPayment({
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 1000,
      status: PaymentStatus.Succeeded,
      stripeChargeId: `ch_${core.nanoid()}`,
      livemode: true,
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })
  })

  it('returns pricingModelId for a customer payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await derivePricingModelIdFromEventPayload(
          { id: customer.id, object: EventNoun.Customer },
          transaction
        )

        expect(result).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a subscription payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await derivePricingModelIdFromEventPayload(
          { id: subscription.id, object: EventNoun.Subscription },
          transaction
        )

        expect(result).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a payment payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await derivePricingModelIdFromEventPayload(
          { id: payment.id, object: EventNoun.Payment },
          transaction
        )

        expect(result).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns pricingModelId for a purchase payload', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await derivePricingModelIdFromEventPayload(
          { id: purchase.id, object: EventNoun.Purchase },
          transaction
        )

        expect(result).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws an error when the payload ID does not exist', async () => {
    const nonExistentId = `cust_${core.nanoid()}`(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          derivePricingModelIdFromEventPayload(
            { id: nonExistentId, object: EventNoun.Customer },
            transaction
          )
        ).rejects.toThrow(
          `Pricing model id not found for event payload ${nonExistentId} (object type: customer)`
        )
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws an error for unsupported EventNoun types', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          derivePricingModelIdFromEventPayload(
            { id: 'user_123', object: EventNoun.User },
            transaction
          )
        ).rejects.toThrow(
          'Pricing model id not found for event payload user_123 (object type: user)'
        )
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})

describe('bulkInsertOrDoNothingEventsByHash', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let payment: Payment.Record
  let purchase: Purchase.Record
  let invoice: Invoice.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      active: true,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${Date.now()}@test.com`,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      status: InvoiceStatus.Draft,
      livemode: true,
      priceId: price.id,
    })

    payment = await setupPayment({
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 1000,
      status: PaymentStatus.Succeeded,
      stripeChargeId: `ch_${core.nanoid()}`,
      livemode: true,
    })

    purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })
  })

  it('inserts events with pricingModelId derived from customer payload', async () => {
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer.id,
                object: EventNoun.Customer,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
        expect(result[0].hash).toBe(hash)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('inserts events with pricingModelId derived from payment payload', async () => {
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.PaymentSucceeded,
              payload: {
                id: payment.id,
                object: EventNoun.Payment,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('inserts events with pricingModelId derived from subscription payload', async () => {
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.SubscriptionCreated,
              payload: {
                id: subscription.id,
                object: EventNoun.Subscription,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('inserts events with pricingModelId derived from purchase payload', async () => {
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.PurchaseCompleted,
              payload: {
                id: purchase.id,
                object: EventNoun.Purchase,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('uses provided pricingModelId instead of deriving it', async () => {
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer.id,
                object: EventNoun.Customer,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash,
              organizationId: organization.id,
              livemode: true,
              pricingModelId: pricingModel.id, // Pre-provided
            },
          ],
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('inserts multiple events with mixed pricingModelId derivation', async () => {
    const hash1 = `hash_${core.nanoid()}`
    const hash2 = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer.id,
                object: EventNoun.Customer,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash: hash1,
              organizationId: organization.id,
              livemode: true,
              // No pricingModelId - will be derived
            },
            {
              type: FlowgladEventType.PaymentSucceeded,
              payload: {
                id: payment.id,
                object: EventNoun.Payment,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash: hash2,
              organizationId: organization.id,
              livemode: true,
              pricingModelId: pricingModel.id, // Pre-provided
            },
          ],
          transaction
        )

        expect(result).toHaveLength(2)
        expect(result[0].pricingModelId).toBe(pricingModel.id)
        expect(result[1].pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('does not insert duplicate events with the same hash', async () => {
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        // First insert
        const firstResult = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer.id,
                object: EventNoun.Customer,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash,
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        expect(firstResult).toHaveLength(1)
        const eventId = firstResult[0].id

        // Second insert with same hash - should do nothing
        const secondResult = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer.id,
                object: EventNoun.Customer,
              },
              occurredAt: now + 1000, // Different timestamp
              submittedAt: now + 1000,
              metadata: { different: 'metadata' },
              hash, // Same hash
              organizationId: organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        // Second insert returns empty since it did nothing
        expect(secondResult).toHaveLength(0)

        // Verify the original event was not modified
        const originalEvent = await selectEventById(
          eventId,
          transaction
        )
        expect(originalEvent?.id).toBe(eventId)
        expect(originalEvent?.occurredAt).toBe(now)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws an error when payload ID does not exist and cannot derive pricingModelId', async () => {
    const nonExistentId = `cust_${core.nanoid()}`
    const hash = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          bulkInsertOrDoNothingEventsByHash(
            [
              {
                type: FlowgladEventType.CustomerCreated,
                payload: {
                  id: nonExistentId,
                  object: EventNoun.Customer,
                },
                occurredAt: now,
                submittedAt: now,
                metadata: {},
                hash,
                organizationId: organization.id,
                livemode: true,
              },
            ],
            transaction
          )
        ).rejects.toThrow(
          `Pricing model id not found for event payload ${nonExistentId}`
        )
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('inserts events from multiple organizations in a single batch', async () => {
    const org2Data = await setupOrg()
    const customer2 = await setupCustomer({
      organizationId: org2Data.organization.id,
      email: `test2+${Date.now()}@test.com`,
      livemode: true,
      pricingModelId: org2Data.pricingModel.id,
    })

    const hash1 = `hash_${core.nanoid()}`
    const hash2 = `hash_${core.nanoid()}`
    const now = Date.now()(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await bulkInsertOrDoNothingEventsByHash(
          [
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer.id,
                object: EventNoun.Customer,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash: hash1,
              organizationId: organization.id,
              livemode: true,
            },
            {
              type: FlowgladEventType.CustomerCreated,
              payload: {
                id: customer2.id,
                object: EventNoun.Customer,
              },
              occurredAt: now,
              submittedAt: now,
              metadata: {},
              hash: hash2,
              organizationId: org2Data.organization.id,
              livemode: true,
            },
          ],
          transaction
        )

        expect(result).toHaveLength(2)
        // Find events by hash to make test order-independent
        const event1 = result.find((r) => r.hash === hash1)
        const event2 = result.find((r) => r.hash === hash2)
        // Event with hash1 should have org1's pricingModelId
        expect(event1?.pricingModelId).toBe(pricingModel.id)
        expect(event1?.organizationId).toBe(organization.id)
        // Event with hash2 should have org2's pricingModelId
        expect(event2?.pricingModelId).toBe(org2Data.pricingModel.id)
        expect(event2?.organizationId).toBe(org2Data.organization.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})
