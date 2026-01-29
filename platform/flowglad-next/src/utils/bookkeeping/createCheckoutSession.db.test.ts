import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import {
  CheckoutSessionType,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { CreateCheckoutSessionObject } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { CheckoutSessionStatus } from '@/types'
import { core } from '@/utils/core'
import {
  checkoutSessionInsertFromInput,
  createCheckoutSessionTransaction,
} from './createCheckoutSession'

const DEFAULT_SUCCESS_URL = 'https://example.com/success'
const DEFAULT_CANCEL_URL = 'https://example.com/cancel'
const DEFAULT_ORGANIZATION_ID = 'org_test'

type ProductCheckoutInput = Extract<
  CreateCheckoutSessionObject,
  { type: CheckoutSessionType.Product }
>
type AddPaymentMethodCheckoutInput = Extract<
  CreateCheckoutSessionObject,
  { type: CheckoutSessionType.AddPaymentMethod }
>
type ActivateSubscriptionCheckoutInput = Extract<
  CreateCheckoutSessionObject,
  { type: CheckoutSessionType.ActivateSubscription }
>

const buildCustomerRecord = (
  overrides: Partial<Customer.Record> = {}
): Customer.Record =>
  ({
    id: 'cust_123',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByCommit: 'commit',
    updatedByCommit: 'commit',
    livemode: false,
    position: 1,
    organizationId: DEFAULT_ORGANIZATION_ID,
    email: 'customer@example.com',
    name: 'Test Customer',
    invoiceNumberBase: 'INV',
    archived: false,
    stripeCustomerId: 'stripe_cust_123',
    taxId: null,
    logoURL: null,
    iconURL: null,
    domain: null,
    billingAddress: null,
    externalId: 'ext_123',
    userId: null,
    pricingModelId: null,
    stackAuthHostedBillingUserId: null,
    ...overrides,
  }) as Customer.Record

const buildProductCheckoutInput = (
  overrides: Partial<ProductCheckoutInput> = {}
  // @ts-expect-error - limits of spread inference
): ProductCheckoutInput => ({
  type: CheckoutSessionType.Product,
  successUrl: DEFAULT_SUCCESS_URL,
  cancelUrl: DEFAULT_CANCEL_URL,
  priceId: 'price_123',
  customerExternalId: 'customer_external_123',
  ...overrides,
})

const buildAddPaymentMethodCheckoutInput = (
  overrides: Partial<AddPaymentMethodCheckoutInput> = {}
): AddPaymentMethodCheckoutInput => ({
  type: CheckoutSessionType.AddPaymentMethod,
  successUrl: DEFAULT_SUCCESS_URL,
  cancelUrl: DEFAULT_CANCEL_URL,
  customerExternalId: 'customer_external_123',
  ...overrides,
})

const buildActivateSubscriptionCheckoutInput = (
  overrides: Partial<ActivateSubscriptionCheckoutInput> = {}
): ActivateSubscriptionCheckoutInput => ({
  type: CheckoutSessionType.ActivateSubscription,
  successUrl: DEFAULT_SUCCESS_URL,
  cancelUrl: DEFAULT_CANCEL_URL,
  customerExternalId: 'customer_external_123',
  targetSubscriptionId: 'sub_123',
  ...overrides,
})

describe('checkoutSessionInsertFromInput', () => {
  let customer: Customer.Record

  beforeEach(() => {
    customer = buildCustomerRecord()
  })

  it('builds a product checkout payload for an identified customer', () => {
    const input = buildProductCheckoutInput()

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: true,
    })

    expect(result).toMatchObject({
      organizationId: DEFAULT_ORGANIZATION_ID,
      type: CheckoutSessionType.Product,
      status: CheckoutSessionStatus.Open,
      priceId: input.priceId,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      invoiceId: null,
      targetSubscriptionId: null,
      automaticallyUpdateSubscriptions: null,
      preserveBillingCycleAnchor: false,
    })
  })

  it('honors preserveBillingCycleAnchor for product checkouts', () => {
    const input = buildProductCheckoutInput({
      preserveBillingCycleAnchor: true,
    })

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: false,
    })

    expect(result.preserveBillingCycleAnchor).toBe(true)
  })

  it('includes quantity in the insert when provided for product checkouts', () => {
    const input = buildProductCheckoutInput({
      quantity: 5,
    })

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: false,
    })

    expect(result.quantity).toBe(5)
  })

  it('defaults quantity to 1 when not provided for product checkouts', () => {
    const input = buildProductCheckoutInput()

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: false,
    })

    expect(result.quantity).toBe(1)
  })

  it('allows anonymous product checkouts without a customer record', () => {
    const input = buildProductCheckoutInput({
      anonymous: true,
      customerExternalId: null,
    })

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer: null,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: false,
    })

    expect(result.customerId).toBeNull()
    expect(result.customerEmail).toBeNull()
    expect(result.customerName).toBeNull()
  })

  it('throws when a non-anonymous product checkout lacks a customer', () => {
    const input = buildProductCheckoutInput({
      customerExternalId: 'missing_customer',
    })

    expect(() =>
      checkoutSessionInsertFromInput({
        checkoutSessionInput: input,
        customer: null,
        organizationId: DEFAULT_ORGANIZATION_ID,
        livemode: true,
      })
    ).toThrow(
      `Required customer not found for Product checkout (anonymous=false). externalId='missing_customer', organization='${DEFAULT_ORGANIZATION_ID}'.`
    )
  })

  it('builds an add-payment-method checkout payload with customer details', () => {
    const input = buildAddPaymentMethodCheckoutInput({
      targetSubscriptionId: 'sub_456',
    })

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: false,
    })

    expect(result).toMatchObject({
      type: CheckoutSessionType.AddPaymentMethod,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      targetSubscriptionId: 'sub_456',
      automaticallyUpdateSubscriptions: false,
    })
  })

  it('requires a customer for add-payment-method checkouts', () => {
    const input = buildAddPaymentMethodCheckoutInput()

    expect(() =>
      checkoutSessionInsertFromInput({
        checkoutSessionInput: input,
        customer: null,
        organizationId: DEFAULT_ORGANIZATION_ID,
        livemode: false,
      })
    ).toThrow(
      'Customer is required for add payment method checkout sessions'
    )
  })

  it('builds an activate-subscription checkout payload using the derived price id', () => {
    const input = buildActivateSubscriptionCheckoutInput()
    const derivedPriceId = 'price_from_subscription'

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: true,
      activateSubscriptionPriceId: derivedPriceId,
    })

    expect(result).toMatchObject({
      type: CheckoutSessionType.ActivateSubscription,
      priceId: derivedPriceId,
      targetSubscriptionId: input.targetSubscriptionId,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      purchaseId: null,
      invoiceId: null,
      preserveBillingCycleAnchor: false,
    })
  })

  it('honors preserveBillingCycleAnchor for activate-subscription sessions', () => {
    const input = buildActivateSubscriptionCheckoutInput({
      preserveBillingCycleAnchor: true,
    })

    const result = checkoutSessionInsertFromInput({
      checkoutSessionInput: input,
      customer,
      organizationId: DEFAULT_ORGANIZATION_ID,
      livemode: true,
      activateSubscriptionPriceId: 'price_from_subscription',
    })

    expect(result.preserveBillingCycleAnchor).toBe(true)
  })

  it('requires a customer for activate-subscription sessions', () => {
    const input = buildActivateSubscriptionCheckoutInput()

    expect(() =>
      checkoutSessionInsertFromInput({
        checkoutSessionInput: input,
        customer: null,
        organizationId: DEFAULT_ORGANIZATION_ID,
        livemode: true,
        activateSubscriptionPriceId: 'price_from_subscription',
      })
    ).toThrow(
      'Customer is required for activate subscription checkout sessions'
    )
  })

  it('requires a derived price id for activate-subscription sessions', () => {
    const input = buildActivateSubscriptionCheckoutInput()

    expect(() =>
      checkoutSessionInsertFromInput({
        checkoutSessionInput: input,
        customer,
        organizationId: DEFAULT_ORGANIZATION_ID,
        livemode: true,
        activateSubscriptionPriceId: null,
      })
    ).toThrow(
      'Activate subscription checkout sessions require a price derived from the target subscription'
    )
  })

  it('throws when given an unsupported checkout type', () => {
    const invalidInput = {
      type: 'InvalidType',
      successUrl: DEFAULT_SUCCESS_URL,
      cancelUrl: DEFAULT_CANCEL_URL,
      customerExternalId: 'customer_external_123',
    } as unknown as CreateCheckoutSessionObject

    expect(() =>
      checkoutSessionInsertFromInput({
        checkoutSessionInput: invalidInput,
        customer,
        organizationId: DEFAULT_ORGANIZATION_ID,
        livemode: true,
      })
    ).toThrow('Invalid checkout session, type: InvalidType')
  })
})

describe('createCheckoutSessionTransaction', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let singlePaymentPrice: Price.Record
  let subscriptionPrice: Price.Record
  let usagePrice: Price.Record
  let usageMeter: UsageMeter.Record
  let targetSubscription: Subscription.Record

  beforeEach(async () => {
    const { organization: org, pricingModel } = await setupOrg()
    organization = org
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
      pricingModelId: pricingModel.id,
    })
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Usage Meter',
      pricingModelId: pricingModel.id,
    })

    // Create a non-default product for testing
    const nonDefaultProduct = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      livemode: true,
      pricingModelId: pricingModel.id,
      active: true,
      default: false,
    })

    singlePaymentPrice = await setupPrice({
      productId: nonDefaultProduct.id,
      type: PriceType.SinglePayment,
      name: 'Single Payment Price',
      unitPrice: 1000,
      livemode: true,
      isDefault: false,
    })
    subscriptionPrice = await setupPrice({
      productId: nonDefaultProduct.id,
      type: PriceType.Subscription,
      name: 'Subscription Price',
      unitPrice: 500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })
    usagePrice = await setupPrice({
      type: PriceType.Usage,
      name: 'Usage Price',
      unitPrice: 100,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })
    targetSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: subscriptionPrice.id,
      status: SubscriptionStatus.Incomplete,
      livemode: true,
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

    const result = await adminTransaction(async ({ transaction }) =>
      createCheckoutSessionTransaction(
        {
          checkoutSessionInput,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toContain(
        `Required customer not found for Product checkout (anonymous=false). externalId='non-existent-customer', organization='${organization.id}'.`
      )
    }
  })

  it('should create a checkout session for a SinglePayment product', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.Product,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      priceId: singlePaymentPrice.id,
    }

    const { checkoutSession, url } = (
      await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )
    ).unwrap()

    expect(typeof checkoutSession.stripePaymentIntentId).toBe(
      'string'
    )
    expect(checkoutSession.stripeSetupIntentId).toBeNull()
    expect(url).toBe(
      `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
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

    const { checkoutSession, url } = (
      await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )
    ).unwrap()

    expect(checkoutSession.stripePaymentIntentId).toBeNull()
    expect(typeof checkoutSession.stripeSetupIntentId).toBe('string')
    expect(url).toBe(
      `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
    )
  })

  it('throws error when creating checkout session for usage price (which has null product)', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.Product,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      priceId: usagePrice.id,
    }

    const result = await adminTransaction(async ({ transaction }) =>
      createCheckoutSessionTransaction(
        {
          checkoutSessionInput,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toContain(
        'Checkout sessions are only supported for product prices (subscription/single payment), not usage prices'
      )
    }
  })

  it('should create a checkout session for AddPaymentMethod', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.AddPaymentMethod,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
    }

    const { checkoutSession, url } = (
      await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )
    ).unwrap()

    expect(typeof checkoutSession.stripeSetupIntentId).toBe('string')
    expect(url).toBe(
      `${core.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
    )
  })

  it('should create a checkout session for ActivateSubscription', async () => {
    const checkoutSessionInput: CreateCheckoutSessionObject = {
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.ActivateSubscription,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      targetSubscriptionId: targetSubscription.id,
    }

    const { checkoutSession, url } = (
      await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )
    ).unwrap()

    expect(typeof checkoutSession.stripeSetupIntentId).toBe('string')
    expect(checkoutSession.stripePaymentIntentId).toBeNull()
    expect(checkoutSession.priceId).toBe(subscriptionPrice.id)
    expect(url).toBe(
      `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
    )
  })

  it('should throw an error for an invalid checkout session type', async () => {
    const checkoutSessionInput = {
      customerExternalId: customer.externalId,
      type: 'InvalidType',
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
    }

    const result = await adminTransaction(async ({ transaction }) =>
      createCheckoutSessionTransaction(
        {
          // @ts-expect-error - testing invalid type
          checkoutSessionInput,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toContain(
        'Invalid checkout session, type: InvalidType'
      )
    }
  })

  describe('Default product validation', () => {
    it('should throw an error when trying to create a checkout session for a default product', async () => {
      // Create a default product and price
      const { organization: defaultOrg, product: defaultProduct } =
        await setupOrg()
      try {
        const defaultPrice = await setupPrice({
          productId: defaultProduct.id,
          type: PriceType.SinglePayment,
          name: 'Default Product Price',
          unitPrice: 0,
          livemode: true,
          isDefault: true,
        })

        // Create a customer for the default organization
        const defaultCustomer = await setupCustomer({
          organizationId: defaultOrg.id,
          stripeCustomerId: `cus_${core.nanoid()}`,
        })

        const checkoutSessionInput: CreateCheckoutSessionObject = {
          customerExternalId: defaultCustomer.externalId,
          type: CheckoutSessionType.Product,
          successUrl: 'http://success.url',
          cancelUrl: 'http://cancel.url',
          priceId: defaultPrice.id,
        }

        const result = await adminTransaction(
          async ({ transaction }) =>
            createCheckoutSessionTransaction(
              {
                checkoutSessionInput,
                organizationId: defaultOrg.id,
                livemode: false,
              },
              transaction
            )
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.message).toContain(
            'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
          )
        }
      } finally {
        await teardownOrg({ organizationId: defaultOrg.id })
      }
    })

    it('should allow creating checkout sessions for non-default products', async () => {
      // This test verifies that the existing functionality still works for non-default products
      const checkoutSessionInput: CreateCheckoutSessionObject = {
        customerExternalId: customer.externalId,
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
        priceId: singlePaymentPrice.id,
      }

      const { checkoutSession } = (
        await adminTransaction(async ({ transaction }) =>
          createCheckoutSessionTransaction(
            {
              checkoutSessionInput,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).unwrap()

      expect(typeof checkoutSession.stripePaymentIntentId).toBe(
        'string'
      )
      expect(checkoutSession.stripeSetupIntentId).toBeNull()
    })
  })

  describe('Anonymous checkout sessions', () => {
    it('should create an anonymous product checkout session without a customer', async () => {
      const checkoutSessionInput: CreateCheckoutSessionObject = {
        type: CheckoutSessionType.Product,
        anonymous: true,
        customerExternalId: null,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
        priceId: singlePaymentPrice.id,
      }

      const { checkoutSession, url } = (
        await adminTransaction(async ({ transaction }) =>
          createCheckoutSessionTransaction(
            {
              checkoutSessionInput,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).unwrap()

      expect(checkoutSession.customerId).toBeNull()
      expect(checkoutSession.customerEmail).toBeNull()
      expect(checkoutSession.customerName).toBeNull()
      expect(typeof checkoutSession.stripePaymentIntentId).toBe(
        'string'
      )
      expect(url).toBe(
        `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
      )
    })

    it('should throw error when non-anonymous product checkout has missing customerExternalId', async () => {
      const checkoutSessionInput: CreateCheckoutSessionObject = {
        type: CheckoutSessionType.Product,
        anonymous: false,
        customerExternalId: 'non-existent-customers',
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
        priceId: singlePaymentPrice.id,
      }

      const result = await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          `Required customer not found for Product checkout (anonymous=false). externalId='non-existent-customers', organization='${organization.id}'.`
        )
      }
    })

    it('should populate customer fields correctly for non-anonymous checkout with valid customer', async () => {
      const checkoutSessionInput: CreateCheckoutSessionObject = {
        type: CheckoutSessionType.Product,
        customerExternalId: customer.externalId,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
        priceId: singlePaymentPrice.id,
      }

      const { checkoutSession } = (
        await adminTransaction(async ({ transaction }) =>
          createCheckoutSessionTransaction(
            {
              checkoutSessionInput,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).unwrap()

      expect(checkoutSession.customerId).toBe(customer.id)
      expect(checkoutSession.customerEmail).toBe(customer.email)
      expect(checkoutSession.customerName).toBe(customer.name)
    })

    it('should require customer for AddPaymentMethod checkout even with anonymous flag', async () => {
      const checkoutSessionInput: CreateCheckoutSessionObject = {
        type: CheckoutSessionType.AddPaymentMethod,
        // @ts-expect-error - testing that anonymous is ignored
        anonymous: true,
        customerExternalId: 'non-existent-customer',
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

      const result = await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Customer is required for add payment method checkout sessions'
        )
      }
    })

    it('should require customer for ActivateSubscription checkout even with anonymous flag', async () => {
      const checkoutSessionInput: CreateCheckoutSessionObject = {
        type: CheckoutSessionType.ActivateSubscription,
        // @ts-expect-error - testing that anonymous is ignored
        anonymous: true,
        customerExternalId: 'non-existent-customer',
        targetSubscriptionId: targetSubscription.id,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

      const result = await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Customer is required for activate subscription checkout sessions'
        )
      }
    })
  })

  describe('ActivateSubscription target subscription validation', () => {
    const buildActivateInput = (
      overrides: Partial<ActivateSubscriptionCheckoutInput> = {}
    ): ActivateSubscriptionCheckoutInput => ({
      customerExternalId: customer.externalId,
      type: CheckoutSessionType.ActivateSubscription,
      successUrl: 'http://success.url',
      cancelUrl: 'http://cancel.url',
      targetSubscriptionId: targetSubscription.id,
      ...overrides,
    })

    it('should throw when the target subscription does not exist', async () => {
      const checkoutSessionInput = buildActivateInput({
        targetSubscriptionId: 'missing_sub',
      })

      const result = await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Target subscription missing_sub not found'
        )
      }
    })

    it('should throw when the target subscription belongs to another organization', async () => {
      const { organization: otherOrg, price: otherPrice } =
        await setupOrg()
      try {
        const otherCustomer = await setupCustomer({
          organizationId: otherOrg.id,
          stripeCustomerId: `cus_${core.nanoid()}`,
        })
        const otherSubscription = await setupSubscription({
          organizationId: otherOrg.id,
          customerId: otherCustomer.id,
          priceId: otherPrice.id,
          status: SubscriptionStatus.Incomplete,
          livemode: true,
        })

        const checkoutSessionInput = buildActivateInput({
          targetSubscriptionId: otherSubscription.id,
        })

        const result = await adminTransaction(
          async ({ transaction }) =>
            createCheckoutSessionTransaction(
              {
                checkoutSessionInput,
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.message).toContain(
            `Target subscription ${otherSubscription.id} does not belong to organization ${organization.id}`
          )
        }
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })

    it('should throw when the target subscription belongs to another customer', async () => {
      const otherCustomer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: `cus_${core.nanoid()}`,
      })
      const otherCustomerSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: otherCustomer.id,
        priceId: subscriptionPrice.id,
        status: SubscriptionStatus.Incomplete,
        livemode: true,
      })

      const checkoutSessionInput = buildActivateInput({
        targetSubscriptionId: otherCustomerSubscription.id,
      })

      const result = await adminTransaction(async ({ transaction }) =>
        createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          `Target subscription ${otherCustomerSubscription.id} does not belong to customer ${customer.id}`
        )
      }
    })
  })

  describe('Price slug support', () => {
    let organization: Organization.Record
    let customer: Customer.Record
    let subscriptionPrice: Price.Record
    let nonDefaultProduct: Product.Record

    beforeEach(async () => {
      const setup = await setupOrg()
      organization = setup.organization
      const testmodePricingModel = setup.testmodePricingModel
      customer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: `cus_${core.nanoid()}`,
        pricingModelId: testmodePricingModel.id,
      })

      // Create a non-default product and price for testing
      nonDefaultProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        livemode: false,
        pricingModelId: testmodePricingModel.id,
        active: true,
        default: false,
      })
      subscriptionPrice = await setupPrice({
        productId: nonDefaultProduct.id,
        name: 'Test Subscription Price',
        unitPrice: 1000,
        livemode: false,
        isDefault: false,
        type: PriceType.Subscription,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        slug: 'test-subscription-price',
      })
    })

    afterEach(async () => {
      await teardownOrg({ organizationId: organization.id })
    })

    describe('identified product checkout with price slug', () => {
      it('should create checkout session using priceSlug for identified customer', async () => {
        const checkoutSessionInput: ProductCheckoutInput = {
          customerExternalId: customer.externalId,
          type: CheckoutSessionType.Product,
          successUrl: 'http://success.url',
          cancelUrl: 'http://cancel.url',
          priceSlug: subscriptionPrice.slug!,
        }

        const { checkoutSession } = (
          await adminTransaction(async ({ transaction }) =>
            createCheckoutSessionTransaction(
              {
                checkoutSessionInput,
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )
          )
        ).unwrap()

        expect(checkoutSession).toMatchObject({})
        expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
        expect(checkoutSession.priceId).toBe(subscriptionPrice.id)
        expect(checkoutSession.customerId).toBe(customer.id)
      })

      it('should throw when priceSlug not found for customer', async () => {
        const checkoutSessionInput: ProductCheckoutInput = {
          customerExternalId: customer.externalId,
          type: CheckoutSessionType.Product,
          successUrl: 'http://success.url',
          cancelUrl: 'http://cancel.url',
          priceSlug: 'non-existent-slug',
        }

        const result = await adminTransaction(
          async ({ transaction }) =>
            createCheckoutSessionTransaction(
              {
                checkoutSessionInput,
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.message).toContain(
            'Price with slug "non-existent-slug" not found for customer\'s pricing model'
          )
        }
      })
    })

    describe('anonymous product checkout with price slug', () => {
      it('should create checkout session using priceSlug for anonymous customer', async () => {
        const checkoutSessionInput: ProductCheckoutInput = {
          type: CheckoutSessionType.Product,
          successUrl: 'http://success.url',
          cancelUrl: 'http://cancel.url',
          priceSlug: subscriptionPrice.slug!,
          anonymous: true,
        }

        const { checkoutSession } = (
          await adminTransaction(async ({ transaction }) =>
            createCheckoutSessionTransaction(
              {
                checkoutSessionInput,
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )
          )
        ).unwrap()

        expect(checkoutSession).toMatchObject({})
        expect(checkoutSession.type).toBe(CheckoutSessionType.Product)
        expect(checkoutSession.priceId).toBe(subscriptionPrice.id)
        expect(checkoutSession.customerId).toBeNull()
      })

      it('should throw when priceSlug not found in organization default pricing model', async () => {
        const checkoutSessionInput: ProductCheckoutInput = {
          type: CheckoutSessionType.Product,
          successUrl: 'http://success.url',
          cancelUrl: 'http://cancel.url',
          priceSlug: 'non-existent-slug',
          anonymous: true,
        }

        const result = await adminTransaction(
          async ({ transaction }) =>
            createCheckoutSessionTransaction(
              {
                checkoutSessionInput,
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )
        )

        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error.message).toContain(
            'Price with slug "non-existent-slug" not found in organization\'s default pricing model'
          )
        }
      })
    })
  })
})
