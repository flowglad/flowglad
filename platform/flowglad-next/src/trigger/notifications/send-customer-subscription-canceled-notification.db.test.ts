import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { SubscriptionStatus } from '@db-core/enums'
import {
  setupCustomer,
  setupOrg,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Subscription } from '@/db/schema/subscriptions'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import * as actualEmail from '@/utils/email'
import { runSendCustomerSubscriptionCanceledNotification } from './send-customer-subscription-canceled-notification'

// Mock email sending since it makes network calls
const mockSafeSend = mock<typeof actualEmail.safeSend>()

mock.module('@/utils/email', () => ({
  ...actualEmail,
  safeSend: mockSafeSend,
}))

describe('runSendCustomerSubscriptionCanceledNotification', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let subscription: Subscription.Record

  beforeEach(async () => {
    mockSafeSend.mockClear()
    mockSafeSend.mockResolvedValue({
      data: { id: 'test-email-id' },
      error: null,
    })

    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${Date.now()}@example.com`,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Canceled,
      canceledAt: Date.now(),
    })
  })

  it('returns NotFoundError when subscription does not exist', async () => {
    const result =
      await runSendCustomerSubscriptionCanceledNotification({
        subscriptionId: 'non-existent-subscription-id',
      })

    expect(result.status).toBe('error')
    // Check error properties instead of instanceof due to module boundary issues
    // The NotFoundError from tableUtils uses resourceType/resourceId
    const error = (result as { status: 'error'; error: unknown })
      .error as {
      name: string
      resourceType: string
      resourceId: string
    }
    expect(error.name).toBe('NotFoundError')
    expect(error.resourceType).toBe('subscriptions')
    expect(error.resourceId).toBe('non-existent-subscription-id')
  })

  it('returns ValidationError when customer has no email', async () => {
    // Create a customer and then update to remove email
    const customerWithEmail = await setupCustomer({
      organizationId: organization.id,
    })

    // Update customer to have empty email (null is not allowed by schema)
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        { id: customerWithEmail.id, email: '' },
        transaction
      )
    })

    const orgSetup2 = await setupOrg()
    const subscriptionForCustomerWithoutEmail =
      await setupSubscription({
        organizationId: organization.id,
        customerId: customerWithEmail.id,
        priceId: orgSetup2.price.id,
        status: SubscriptionStatus.Canceled,
        canceledAt: Date.now(),
      })

    const result =
      await runSendCustomerSubscriptionCanceledNotification({
        subscriptionId: subscriptionForCustomerWithoutEmail.id,
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

  it('returns Result.ok with skip message when subscription has no cancellation date', async () => {
    // Create a subscription without cancellation date
    const orgSetup2 = await setupOrg()
    const activeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup2.price.id,
      status: SubscriptionStatus.Active,
    })

    const result =
      await runSendCustomerSubscriptionCanceledNotification({
        subscriptionId: activeSubscription.id,
      })

    expect(result.status).toBe('ok')
    const value = (
      result as { status: 'ok'; value: { message: string } }
    ).value
    expect(value.message).toContain(
      'subscription has no cancellation date'
    )
  })

  it('returns Result.ok with success message when notification is sent successfully', async () => {
    const result =
      await runSendCustomerSubscriptionCanceledNotification({
        subscriptionId: subscription.id,
      })

    expect(result.status).toBe('ok')
    const value = (
      result as { status: 'ok'; value: { message: string } }
    ).value
    expect(value.message).toBe(
      'Customer subscription canceled notification sent successfully'
    )
  })
})
