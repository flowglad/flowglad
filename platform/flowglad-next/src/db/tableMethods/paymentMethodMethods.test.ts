import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { PaymentMethodType } from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { PaymentMethod } from '../schema/paymentMethods'
import type { PricingModel } from '../schema/pricingModels'
import { selectPaymentMethodsByCustomerId } from './paymentMethodMethods'

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
