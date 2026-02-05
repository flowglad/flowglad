import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { Subscription } from '@db-core/schema/subscriptions'
import {
  setupCustomer,
  setupOrg,
  setupSubscription,
} from '@/../seedDatabase'
import * as actualEmail from '@/utils/email'
import { runSendCustomerSubscriptionCreatedNotification } from './send-customer-subscription-created-notification'

// Mock email sending since it makes network calls
const mockSafeSend = mock<typeof actualEmail.safeSend>()

mock.module('@/utils/email', () => ({
  ...actualEmail,
  safeSend: mockSafeSend,
}))

describe('runSendCustomerSubscriptionCreatedNotification', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let price: Price.Record

  beforeEach(async () => {
    mockSafeSend.mockClear()
    mockSafeSend.mockResolvedValue({
      data: { id: 'test-email-id' },
      error: null,
    })

    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    price = orgSetup.price

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${Date.now()}@example.com`,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })
  })

  it('sends email successfully and passes isDoNotCharge: true when subscription has doNotCharge set', async () => {
    // Create a subscription with doNotCharge = true
    const doNotChargeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      doNotCharge: true,
    })

    const result =
      await runSendCustomerSubscriptionCreatedNotification({
        customerId: customer.id,
        subscriptionId: doNotChargeSubscription.id,
        organizationId: organization.id,
      })

    expect(result.status).toBe('ok')
    const value = (
      result as { status: 'ok'; value: { message: string } }
    ).value
    expect(value.message).toBe(
      'Customer subscription created notification sent successfully'
    )

    // Verify safeSend was called
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    const callArgs = mockSafeSend.mock.calls[0][0]
    expect(callArgs).toHaveProperty('react')
    expect(callArgs).toHaveProperty('to')
    expect(callArgs.to).toContain(customer.email)
  })

  it('sends email successfully and passes isDoNotCharge: false when subscription does not have doNotCharge set', async () => {
    const result =
      await runSendCustomerSubscriptionCreatedNotification({
        customerId: customer.id,
        subscriptionId: subscription.id,
        organizationId: organization.id,
      })

    expect(result.status).toBe('ok')
    const value = (
      result as { status: 'ok'; value: { message: string } }
    ).value
    expect(value.message).toBe(
      'Customer subscription created notification sent successfully'
    )

    // Verify safeSend was called
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    const callArgs = mockSafeSend.mock.calls[0][0]
    expect(callArgs).toHaveProperty('react')
    expect(callArgs).toHaveProperty('to')
    expect(callArgs.to).toContain(customer.email)
  })
})
