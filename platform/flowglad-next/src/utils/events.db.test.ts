import { describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  EventNoun,
  FlowgladEventType,
  IntervalUnit,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
} from '@db-core/enums'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupPurchase,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectEvents } from '@/db/tableMethods/eventMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import core from './core'
import {
  commitCustomerCreatedEvent,
  commitCustomerUpdatedEvent,
  commitPaymentCanceledEvent,
  commitPaymentSucceededEvent,
  commitPurchaseCompletedEvent,
  commitSubscriptionCanceledEvent,
  commitSubscriptionCreatedEvent,
  commitSubscriptionUpdatedEvent,
} from './events'

describe('Webhook Event Payloads - Simple Real Tests', () => {
  it('should include customer.externalId in CustomerCreated event payload', async () => {
    // Set up minimal database state
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })(
      // Call the actual function
      await adminTransactionWithResult(async ({ transaction }) => {
        await commitCustomerCreatedEvent(customer, transaction)
        return Result.ok(undefined)
      })
    ).unwrap()

    // Query the database to get the actual event that was created
    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const customerCreatedEvent = events.find(
      (e) => e.type === FlowgladEventType.CustomerCreated
    )

    // Verify the real payload includes externalId
    expect(typeof customerCreatedEvent).toBe('object')
    expect(customerCreatedEvent!.payload).toEqual({
      id: customer.id,
      object: EventNoun.Customer,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in CustomerUpdated event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })(
      await adminTransactionWithResult(async ({ transaction }) => {
        await commitCustomerUpdatedEvent(customer, transaction)
        return Result.ok(undefined)
      })
    ).unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const customerUpdatedEvent = events.find(
      (e) => e.type === FlowgladEventType.CustomerUpdated
    )

    expect(typeof customerUpdatedEvent).toBe('object')
    expect(customerUpdatedEvent!.payload).toEqual({
      id: customer.id,
      object: EventNoun.Customer,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in PaymentSucceeded event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for payment
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: orgData.pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      isDefault: false,
      livemode: true,
    })
    const invoice = await setupInvoice({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    const paymentMethod = await setupPaymentMethod({
      customerId: customer.id,
      organizationId: orgData.organization.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    const payment = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await insertPayment(
            {
              stripeChargeId: `ch_${core.nanoid()}`,
              status: PaymentStatus.Succeeded,
              amount: 5000,
              currency: CurrencyCode.USD,
              chargeDate: Date.now(),
              paymentMethod: PaymentMethodType.Card,
              livemode: true,
              customerId: customer.id,
              organizationId: orgData.organization.id,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
              invoiceId: invoice.id,
            },
            transaction
          )
        )
      })
    )
      .unwrap()
      .unwrap()(
        await adminTransactionWithResult(async ({ transaction }) => {
          await commitPaymentSucceededEvent(payment, transaction)
          return Result.ok(undefined)
        })
      )
      .unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const paymentSucceededEvent = events.find(
      (e) => e.type === FlowgladEventType.PaymentSucceeded
    )

    expect(typeof paymentSucceededEvent).toBe('object')
    expect(paymentSucceededEvent!.payload).toEqual({
      id: payment.id,
      object: EventNoun.Payment,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in PaymentFailed event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for payment
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: orgData.pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      isDefault: false,
      livemode: true,
    })
    const invoice = await setupInvoice({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    const paymentMethod = await setupPaymentMethod({
      customerId: customer.id,
      organizationId: orgData.organization.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    const payment = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await insertPayment(
            {
              stripeChargeId: `ch_${core.nanoid()}`,
              status: PaymentStatus.Failed,
              amount: 5000,
              currency: CurrencyCode.USD,
              chargeDate: Date.now(),
              paymentMethod: PaymentMethodType.Card,
              livemode: true,
              customerId: customer.id,
              organizationId: orgData.organization.id,
              stripePaymentIntentId: `pi_${core.nanoid()}`,
              invoiceId: invoice.id,
            },
            transaction
          )
        )
      })
    )
      .unwrap()
      .unwrap()(
        await adminTransactionWithResult(async ({ transaction }) => {
          await commitPaymentCanceledEvent(payment, transaction)
          return Result.ok(undefined)
        })
      )
      .unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const paymentFailedEvent = events.find(
      (e) => e.type === FlowgladEventType.PaymentFailed
    )

    expect(typeof paymentFailedEvent).toBe('object')
    expect(paymentFailedEvent!.payload).toEqual({
      id: payment.id,
      object: EventNoun.Payment,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in PurchaseCompleted event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for purchase (use pricingModel from setupOrg to avoid livemode uniqueness constraint)
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: orgData.pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      isDefault: false,
      livemode: true,
    })

    const purchase = await setupPurchase({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })(
      await adminTransactionWithResult(async ({ transaction }) => {
        await commitPurchaseCompletedEvent(purchase, transaction)
        return Result.ok(undefined)
      })
    ).unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const purchaseCompletedEvent = events.find(
      (e) => e.type === FlowgladEventType.PurchaseCompleted
    )

    expect(typeof purchaseCompletedEvent).toBe('object')
    expect(purchaseCompletedEvent!.payload).toEqual({
      id: purchase.id,
      object: EventNoun.Purchase,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in SubscriptionCreated event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for subscription
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: orgData.pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      isDefault: false,
      livemode: true,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })(
      await adminTransactionWithResult(async ({ transaction }) => {
        await commitSubscriptionCreatedEvent(
          subscription,
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const subscriptionCreatedEvent = events.find(
      (e) => e.type === FlowgladEventType.SubscriptionCreated
    )

    expect(typeof subscriptionCreatedEvent).toBe('object')
    expect(subscriptionCreatedEvent!.payload).toEqual({
      id: subscription.id,
      object: EventNoun.Subscription,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in SubscriptionUpdated event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for subscription
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: orgData.pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      isDefault: false,
      livemode: true,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })(
      await adminTransactionWithResult(async ({ transaction }) => {
        await commitSubscriptionUpdatedEvent(
          subscription,
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const subscriptionUpdatedEvent = events.find(
      (e) => e.type === FlowgladEventType.SubscriptionUpdated
    )

    expect(typeof subscriptionUpdatedEvent).toBe('object')
    expect(subscriptionUpdatedEvent!.payload).toEqual({
      id: subscription.id,
      object: EventNoun.Subscription,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in SubscriptionCanceled event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for subscription
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: orgData.pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      isDefault: false,
      livemode: true,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const subscription = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })(
      await adminTransactionWithResult(async ({ transaction }) => {
        await commitSubscriptionCanceledEvent(
          subscription,
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    const events = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectEvents(
            { organizationId: orgData.organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    const subscriptionCancelledEvent = events.find(
      (e) => e.type === FlowgladEventType.SubscriptionCanceled
    )

    expect(typeof subscriptionCancelledEvent).toBe('object')
    expect(subscriptionCancelledEvent!.payload).toEqual({
      id: subscription.id,
      object: EventNoun.Subscription,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })
})
