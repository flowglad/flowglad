/**
 * DB tests for adjustment billing run error handling.
 *
 * Tests that need real Stripe API calls (payment success/failure scenarios)
 * are in adjustmentBillingRun.integration.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { executeBillingRun } from './billingRunHelpers'

describe('executeBillingRun - Adjustment Billing Run Error Handling', () => {
  let organization: Organization.Record
  let staticPrice: Price.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    staticPrice = orgData.price

    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: staticPrice.id,
      paymentMethodId: paymentMethod.id,
      status: SubscriptionStatus.Active,
    })

    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: staticPrice.id,
      name: staticPrice.name ?? 'Static Item Name',
      quantity: 1,
      unitPrice: staticPrice.unitPrice,
      type: SubscriptionItemType.Static,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: staticPrice.unitPrice,
      name: staticPrice.name ?? 'Static Item Name',
      type: SubscriptionItemType.Static,
      description: 'Test Description',
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('fails with clear error when executing an adjustment billing run without adjustment params', async () => {
    const adjustmentBillingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
      isAdjustment: true,
    })

    // Execute without adjustment params - should fail early before Stripe calls
    await executeBillingRun(adjustmentBillingRun.id)

    const updatedBillingRun = (
      await adminTransactionWithResult(({ transaction }) =>
        selectBillingRunById(
          adjustmentBillingRun.id,
          transaction
        ).then((r) => Result.ok(r.unwrap()))
      )
    ).unwrap()
    expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
    expect(typeof updatedBillingRun.errorDetails).toBe('object')
    expect(updatedBillingRun.errorDetails?.message).toContain(
      `executeBillingRun: Adjustment billing run ${adjustmentBillingRun.id} requires adjustmentParams`
    )
  })

  // NOTE: All other adjustment billing run tests that involve Stripe payment processing
  // (success scenarios, failure scenarios, proration, multi-item adjustments)
  // are in adjustmentBillingRun.integration.test.ts because they require real Stripe API calls.
})
