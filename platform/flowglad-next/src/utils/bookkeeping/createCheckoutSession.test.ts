import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest'
import { createCheckoutSessionTransaction } from './createCheckoutSession'
import {
  setupOrg,
  setupCustomer,
  teardownOrg,
  setupPrice,
  setupUsageMeter,
} from '../../../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { CheckoutSessionType, PriceType } from '@/types'
import { CreateCheckoutSessionObject } from '@/db/schema/checkoutSessions'
import { IntervalUnit } from '@/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { core } from '@/utils/core'

describe('createCheckoutSessionTransaction', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let singlePaymentPrice: Price.Record
  let subscriptionPrice: Price.Record
  let usagePrice: Price.Record
  let usageMeter: UsageMeter.Record
  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  beforeEach(async () => {
    const { organization: org, product, catalog } = await setupOrg()
    organization = org
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
    })
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Usage Meter',
      catalogId: catalog.id,
    })
    singlePaymentPrice = await setupPrice({
      productId: product.id,
      type: PriceType.SinglePayment,
      name: 'Single Payment Price',
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })
    subscriptionPrice = await setupPrice({
      productId: product.id,
      type: PriceType.Subscription,
      name: 'Subscription Price',
      unitPrice: 500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })
    usagePrice = await setupPrice({
      productId: product.id,
      type: PriceType.Usage,
      name: 'Usage Price',
      unitPrice: 100,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  it('should throw an error if the customer is not found', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: 'non-existent-customer',
      type: CheckoutSessionType.Product,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      priceId: singlePaymentPrice.id,
    }

    await expect(
      adminTransaction(async (tx) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          tx.transaction
        )
      )
    ).rejects.toThrow(
      'Customer not found for externalId: non-existent-customer'
    )
  })

  it('should create a checkout session for a SinglePayment product', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.Product,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      priceId: singlePaymentPrice.id,
    }

    const { checkoutSession, url } = await adminTransaction(
      async (tx) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          tx.transaction
        )
    )

    expect(checkoutSession.stripePaymentIntentId).not.toBeNull()
    expect(checkoutSession.stripeSetupIntentId).toBeNull()
    expect(url).toBe(
      `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
    )
  })

  it('should create a checkout session for a Subscription product', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.Product,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      priceId: subscriptionPrice.id,
    }

    const { checkoutSession, url } = await adminTransaction(
      async (tx) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          tx.transaction
        )
    )

    expect(checkoutSession.stripePaymentIntentId).toBeNull()
    expect(checkoutSession.stripeSetupIntentId).not.toBeNull()
    expect(url).toBe(
      `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
    )
  })

  it('should create a checkout session for a Usage-based product', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.Product,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      priceId: usagePrice.id,
    }

    const { checkoutSession } = await adminTransaction(async (tx) =>
      createCheckoutSessionTransaction(
        {
          checkoutSessionInput,
          organizationId: organization.id,
          livemode: false,
        },
        tx.transaction
      )
    )

    expect(checkoutSession.stripeSetupIntentId).not.toBeNull()
  })

  it('should create a checkout session for AddPaymentMethod', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.AddPaymentMethod,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
    }

    const { checkoutSession, url } = await adminTransaction(
      async (tx) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          tx.transaction
        )
    )

    expect(checkoutSession.stripeSetupIntentId).not.toBeNull()
    expect(url).toBe(
      `${process.env.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
    )
  })

  it('should create a checkout session for ActivateSubscription', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.ActivateSubscription,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      targetSubscriptionId: 'sub_123',
      priceId: subscriptionPrice.id,
    }

    const { checkoutSession, url } = await adminTransaction(
      async (tx) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          tx.transaction
        )
    )

    expect(checkoutSession.stripeSetupIntentId).toBeDefined()
    expect(checkoutSession.stripePaymentIntentId).toBeNull()
    expect(url).toBe(
      `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
    )
  })

  it('should throw an error for an invalid checkout session type', async () => {
    const checkoutSessionInput = {
      customerExternalId: customer.externalId,
      type: 'InvalidType',
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
    }

    await expect(
      adminTransaction(async (tx) =>
        createCheckoutSessionTransaction(
          {
            // @ts-expect-error - testing invalid type
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          tx.transaction
        )
      )
    ).rejects.toThrow('Invalid checkout session, type: InvalidType')
  })
})
