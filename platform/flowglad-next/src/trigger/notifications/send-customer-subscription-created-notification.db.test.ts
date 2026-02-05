import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { Subscription } from '@db-core/schema/subscriptions'
import { render } from '@react-email/render'
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

  it('sends email with isDoNotCharge content when subscription has doNotCharge set', async () => {
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

    // Verify result is ok
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      throw new Error('Expected result to be ok')
    }
    expect(result.value.message).toBe(
      'Customer subscription created notification sent successfully'
    )

    // Verify safeSend was called with correct recipient
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    const callArgs = mockSafeSend.mock.calls[0][0]
    expect(callArgs).toHaveProperty('react')
    expect(callArgs).toHaveProperty('to')
    expect(callArgs.to).toContain(customer.email)

    // Render the react element to HTML and verify isDoNotCharge content
    const reactElement = (callArgs as { react: React.ReactElement })
      .react
    const html = await render(reactElement)
    expect(html).toContain(
      'You&#x27;ve been granted access to the following plan at no charge:'
    )
    expect(html).toContain('Free')
    expect(html).toContain('no payment required')
    // Should NOT contain auto-renewal language
    expect(html).not.toContain('automatically renews')
  })

  it('sends email without isDoNotCharge content when subscription does not have doNotCharge set', async () => {
    const result =
      await runSendCustomerSubscriptionCreatedNotification({
        customerId: customer.id,
        subscriptionId: subscription.id,
        organizationId: organization.id,
      })

    // Verify result is ok
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      throw new Error('Expected result to be ok')
    }
    expect(result.value.message).toBe(
      'Customer subscription created notification sent successfully'
    )

    // Verify safeSend was called with correct recipient
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    const callArgs = mockSafeSend.mock.calls[0][0]
    expect(callArgs).toHaveProperty('react')
    expect(callArgs).toHaveProperty('to')
    expect(callArgs.to).toContain(customer.email)

    // Render the react element to HTML and verify normal (non-doNotCharge) content
    const reactElement = (callArgs as { react: React.ReactElement })
      .react
    const html = await render(reactElement)
    expect(html).toContain(
      'You&#x27;ve successfully subscribed to the following plan:'
    )
    expect(html).toContain('automatically renews')
    // Should NOT contain doNotCharge-specific content
    expect(html).not.toContain('no payment required')
    expect(html).not.toContain('at no charge')
  })
})
