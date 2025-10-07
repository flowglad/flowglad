import { describe, it, expect } from 'vitest'
import {
  commitCustomerCreatedEvent,
  commitCustomerUpdatedEvent,
  commitPaymentSucceededEvent,
  commitPaymentCanceledEvent,
  commitPurchaseCompletedEvent,
  commitSubscriptionCreatedEvent,
  commitSubscriptionUpdatedEvent,
  commitSubscriptionCancelledEvent,
} from './events'
import {
  FlowgladEventType,
  EventNoun,
  PaymentStatus,
  PriceType,
  CurrencyCode,
  IntervalUnit,
  PaymentMethodType,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import { selectEvents } from '@/db/tableMethods/eventMethods'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupInvoice,
  setupPrice,
  setupProduct,
  setupPurchase,
  setupSubscription,
  setupPricingModel,
} from '@/../seedDatabase'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import core from './core'

describe('Webhook Event Payloads - Simple Real Tests', () => {
  it('should include customer.externalId in CustomerCreated event payload', async () => {
    // Set up minimal database state
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Call the actual function
    await adminTransaction(async ({ transaction }) => {
      await commitCustomerCreatedEvent(customer, transaction)
    })

    // Query the database to get the actual event that was created
    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const customerCreatedEvent = events.find(
      (e) => e.type === FlowgladEventType.CustomerCreated
    )

    // Verify the real payload includes externalId
    expect(customerCreatedEvent).toBeDefined()
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
    })

    await adminTransaction(async ({ transaction }) => {
      await commitCustomerUpdatedEvent(customer, transaction)
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const customerUpdatedEvent = events.find(
      (e) => e.type === FlowgladEventType.CustomerUpdated
    )

    expect(customerUpdatedEvent).toBeDefined()
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
    const pricingModel = await setupPricingModel({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
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

    const payment = await adminTransaction(
      async ({ transaction }) => {
        return await insertPayment(
          {
            stripeChargeId: `ch_${core.nanoid()}`,
            status: PaymentStatus.Succeeded,
            amount: 5000,
            currency: CurrencyCode.USD,
            chargeDate: new Date(),
            paymentMethod: PaymentMethodType.Card,
            livemode: true,
            customerId: customer.id,
            organizationId: orgData.organization.id,
            stripePaymentIntentId: `pi_${core.nanoid()}`,
            invoiceId: invoice.id,
          },
          transaction
        )
      }
    )

    await adminTransaction(async ({ transaction }) => {
      await commitPaymentSucceededEvent(payment, transaction)
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const paymentSucceededEvent = events.find(
      (e) => e.type === FlowgladEventType.PaymentSucceeded
    )

    expect(paymentSucceededEvent).toBeDefined()
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
    const pricingModel = await setupPricingModel({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
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

    const payment = await adminTransaction(
      async ({ transaction }) => {
        return await insertPayment(
          {
            stripeChargeId: `ch_${core.nanoid()}`,
            status: PaymentStatus.Failed,
            amount: 5000,
            currency: CurrencyCode.USD,
            chargeDate: new Date(),
            paymentMethod: PaymentMethodType.Card,
            livemode: true,
            customerId: customer.id,
            organizationId: orgData.organization.id,
            stripePaymentIntentId: `pi_${core.nanoid()}`,
            invoiceId: invoice.id,
          },
          transaction
        )
      }
    )

    await adminTransaction(async ({ transaction }) => {
      await commitPaymentCanceledEvent(payment, transaction)
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const paymentFailedEvent = events.find(
      (e) => e.type === FlowgladEventType.PaymentFailed
    )

    expect(paymentFailedEvent).toBeDefined()
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

    // Set up required dependencies for purchase
    const pricingModel = await setupPricingModel({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      isDefault: false,
      livemode: true,
    })

    const purchase = await setupPurchase({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    await adminTransaction(async ({ transaction }) => {
      await commitPurchaseCompletedEvent(purchase, transaction)
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const purchaseCompletedEvent = events.find(
      (e) => e.type === FlowgladEventType.PurchaseCompleted
    )

    expect(purchaseCompletedEvent).toBeDefined()
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
    const pricingModel = await setupPricingModel({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
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
    })

    await adminTransaction(async ({ transaction }) => {
      await commitSubscriptionCreatedEvent(subscription, transaction)
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const subscriptionCreatedEvent = events.find(
      (e) => e.type === FlowgladEventType.SubscriptionCreated
    )

    expect(subscriptionCreatedEvent).toBeDefined()
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
    const pricingModel = await setupPricingModel({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
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
    })

    await adminTransaction(async ({ transaction }) => {
      await commitSubscriptionUpdatedEvent(subscription, transaction)
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const subscriptionUpdatedEvent = events.find(
      (e) => e.type === FlowgladEventType.SubscriptionUpdated
    )

    expect(subscriptionUpdatedEvent).toBeDefined()
    expect(subscriptionUpdatedEvent!.payload).toEqual({
      id: subscription.id,
      object: EventNoun.Subscription,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    })
  })

  it('should include customer.externalId in SubscriptionCancelled event payload', async () => {
    const orgData = await setupOrg()
    const customer = await setupCustomer({
      organizationId: orgData.organization.id,
      externalId: `ext_cust_${core.nanoid()}`,
      livemode: true,
    })

    // Set up required dependencies for subscription
    const pricingModel = await setupPricingModel({
      organizationId: orgData.organization.id,
      livemode: true,
    })
    const product = await setupProduct({
      organizationId: orgData.organization.id,
      name: `Test Product ${core.nanoid()}`,
      pricingModelId: pricingModel.id,
      livemode: true,
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
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
    })

    await adminTransaction(async ({ transaction }) => {
      await commitSubscriptionCancelledEvent(
        subscription,
        transaction
      )
    })

    const events = await adminTransaction(async ({ transaction }) => {
      return await selectEvents(
        { organizationId: orgData.organization.id },
        transaction
      )
    })

    const subscriptionCancelledEvent = events.find(
      (e) => e.type === FlowgladEventType.SubscriptionCancelled
    )

    expect(subscriptionCancelledEvent).toBeDefined()
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
