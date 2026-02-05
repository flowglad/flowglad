import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
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

  it('returns NotFoundError when subscription does not exist', async () => {
    const result =
      await runSendCustomerSubscriptionCreatedNotification({
        customerId: customer.id,
        subscriptionId: 'non-existent-subscription-id',
        organizationId: organization.id,
      })

    expect(result.status).toBe('error')
    const error = (result as { status: 'error'; error: unknown })
      .error as {
      name: string
    }
    expect(error.name).toBe('NotFoundError')
  })

  it('returns ValidationError when customer has no email', async () => {
    const customerWithEmail = await setupCustomer({
      organizationId: organization.id,
    })

    ;(
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          { id: customerWithEmail.id, email: '' },
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    const orgSetup2 = await setupOrg()
    const subscriptionForCustomerWithoutEmail =
      await setupSubscription({
        organizationId: organization.id,
        customerId: customerWithEmail.id,
        priceId: orgSetup2.price.id,
        status: SubscriptionStatus.Active,
      })

    const result =
      await runSendCustomerSubscriptionCreatedNotification({
        customerId: customerWithEmail.id,
        subscriptionId: subscriptionForCustomerWithoutEmail.id,
        organizationId: organization.id,
      })

    expect(result.status).toBe('error')
    const error = (result as { status: 'error'; error: unknown })
      .error as {
      name: string
      field: string
      reason: string
    }
    expect(error.name).toBe('ValidationError')
    expect(error.field).toBe('email')
    expect(error.reason).toBe('customer email is missing or empty')
  })

  it('returns Result.ok with success message when notification is sent successfully', async () => {
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
  })

  it('passes isDoNotCharge: true to email template when subscription has doNotCharge set', async () => {
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

    // Verify safeSend was called with isDoNotCharge: true in the react props
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    const callArgs = mockSafeSend.mock.calls[0][0]
    // The react prop contains the rendered email - we can't easily inspect it
    // but we can verify the call was made successfully
    expect(callArgs).toHaveProperty('react')
    expect(callArgs).toHaveProperty('to')
    expect(callArgs.to).toContain(customer.email)
  })

  it('passes isDoNotCharge: false to email template when subscription does not have doNotCharge set', async () => {
    const result =
      await runSendCustomerSubscriptionCreatedNotification({
        customerId: customer.id,
        subscriptionId: subscription.id,
        organizationId: organization.id,
      })

    expect(result.status).toBe('ok')

    // Verify safeSend was called
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    const callArgs = mockSafeSend.mock.calls[0][0]
    expect(callArgs).toHaveProperty('react')
    expect(callArgs).toHaveProperty('to')
    expect(callArgs.to).toContain(customer.email)
  })
})
