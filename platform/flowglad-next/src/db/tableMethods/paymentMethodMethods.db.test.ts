import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { createCapturingEffectsContext } from '@/test-utils/transactionCallbacks'
import { PaymentMethodType } from '@/types'
import { CacheDependency } from '@/utils/cache'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { PaymentMethod } from '../schema/paymentMethods'
import type { PricingModel } from '../schema/pricingModels'
import {
  safelyUpdatePaymentMethod,
  selectPaymentMethodById,
  selectPaymentMethods,
  selectPaymentMethodsByCustomerId,
} from './paymentMethodMethods'

describe('selectPaymentMethodsByCustomerId', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${core.nanoid()}@test.com`,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
      type: PaymentMethodType.Card,
    })
  })

  it('should return payment method records for a customer', async () => {
    await adminTransaction(async ({ transaction }) => {
      const paymentMethods = await selectPaymentMethodsByCustomerId(
        customer.id,
        transaction,
        true
      )

      expect(paymentMethods.length).toBeGreaterThanOrEqual(1)
      const foundPaymentMethod = paymentMethods.find(
        (pm) => pm.id === paymentMethod.id
      )
      expect(foundPaymentMethod).toMatchObject({
        id: paymentMethod.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
        pricingModelId: pricingModel.id,
      })
    })
  })

  it('should return empty array when customer has no payment methods', async () => {
    const customerWithNoPaymentMethods = await setupCustomer({
      organizationId: organization.id,
      email: `empty+${core.nanoid()}@test.com`,
      livemode: true,
    })

    await adminTransaction(async ({ transaction }) => {
      const paymentMethods = await selectPaymentMethodsByCustomerId(
        customerWithNoPaymentMethods.id,
        transaction,
        true
      )

      expect(paymentMethods).toEqual([])
    })
  })

  it('should only return payment methods for the specified customer', async () => {
    const otherCustomer = await setupCustomer({
      organizationId: organization.id,
      email: `other+${core.nanoid()}@test.com`,
      livemode: true,
    })

    const otherPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: otherCustomer.id,
      livemode: true,
      type: PaymentMethodType.Card,
    })

    await adminTransaction(async ({ transaction }) => {
      const paymentMethods = await selectPaymentMethodsByCustomerId(
        customer.id,
        transaction,
        true
      )

      const paymentMethodIds = paymentMethods.map((pm) => pm.id)
      expect(paymentMethodIds).toContain(paymentMethod.id)
      expect(paymentMethodIds).not.toContain(otherPaymentMethod.id)
    })
  })
})

describe('safelyUpdatePaymentMethod', () => {
  let organization: Organization.Record
  let customerA: Customer.Record
  let customerB: Customer.Record
  let paymentMethodA: PaymentMethod.Record
  let paymentMethodB: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization

    // Create two customers
    customerA = await setupCustomer({
      organizationId: organization.id,
      email: `customerA+${core.nanoid()}@test.com`,
      livemode: true,
    })

    customerB = await setupCustomer({
      organizationId: organization.id,
      email: `customerB+${core.nanoid()}@test.com`,
      livemode: true,
    })

    // Create a non-default payment method for customer A
    paymentMethodA = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerA.id,
      livemode: true,
      type: PaymentMethodType.Card,
      default: false,
    })

    // Create a default payment method for customer B
    paymentMethodB = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerB.id,
      livemode: true,
      type: PaymentMethodType.Card,
      default: true,
    })
  })

  it('clears existing default on new customer when moving a payment method to a different customer and setting it as default', async () => {
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)

      // Verify initial state: paymentMethodB is the default for customerB
      const initialPaymentMethodB = await selectPaymentMethodById(
        paymentMethodB.id,
        transaction
      )
      expect(initialPaymentMethodB.default).toBe(true)

      // Move paymentMethodA from customerA to customerB AND set it as default
      const updatedPaymentMethod = await safelyUpdatePaymentMethod(
        {
          id: paymentMethodA.id,
          customerId: customerB.id,
          default: true,
        },
        ctx
      )

      // Verify the moved payment method is now on customerB and is default
      expect(updatedPaymentMethod.customerId).toBe(customerB.id)
      expect(updatedPaymentMethod.default).toBe(true)

      // Verify the old default on customerB (paymentMethodB) is no longer default
      const updatedPaymentMethodB = await selectPaymentMethodById(
        paymentMethodB.id,
        transaction
      )
      expect(updatedPaymentMethodB.default).toBe(false)

      // Verify customerA has no payment methods left (since the only one was moved)
      const customerAPaymentMethods = await selectPaymentMethods(
        { customerId: customerA.id },
        transaction
      )
      expect(customerAPaymentMethods).toHaveLength(0)

      // Verify cache invalidations include both customers' set membership keys
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerPaymentMethods(customerA.id)
      )
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerPaymentMethods(customerB.id)
      )

      // Verify cache invalidations include content keys for both payment methods
      // (paymentMethodA was moved, paymentMethodB lost its default status)
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.paymentMethod(paymentMethodA.id)
      )
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.paymentMethod(paymentMethodB.id)
      )
    })
  })

  it('invalidates cache for both old and new customer when moving a payment method without changing default status', async () => {
    await adminTransaction(async ({ transaction }) => {
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)

      // Move paymentMethodA from customerA to customerB (NOT setting as default)
      const updatedPaymentMethod = await safelyUpdatePaymentMethod(
        {
          id: paymentMethodA.id,
          customerId: customerB.id,
        },
        ctx
      )

      // Verify the moved payment method is now on customerB but not default
      expect(updatedPaymentMethod.customerId).toBe(customerB.id)
      expect(updatedPaymentMethod.default).toBe(false)

      // Verify paymentMethodB is still the default for customerB
      const paymentMethodBAfter = await selectPaymentMethodById(
        paymentMethodB.id,
        transaction
      )
      expect(paymentMethodBAfter.default).toBe(true)

      // Verify cache invalidations include both customers' set membership keys
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerPaymentMethods(customerA.id)
      )
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.customerPaymentMethods(customerB.id)
      )

      // Verify the moved payment method's content key is invalidated
      expect(effects.cacheInvalidations).toContain(
        CacheDependency.paymentMethod(paymentMethodA.id)
      )
    })
  })
})
