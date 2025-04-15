'use client'

import { OrganizationSubscriptionCreatedNotificationEmail } from '@/email-templates/organization-subscription-notifications'

type RichCustomer = {
  subscription: {
    name: string
    price: string
    status: string
    nextBillingDate: string
  }
} | null

const InternalDemoPage = () => {
  let customer: RichCustomer = null
  if (1 > 0) {
    customer = {
      subscription: {
        name: 'Pro',
        price: '100',
        status: 'active',
        nextBillingDate: '2025-01-28',
      },
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Internal Demo Page</h1>
      <OrganizationSubscriptionCreatedNotificationEmail
        organizationName="Test Organization"
        subscriptionName="Test Subscription"
        customerId="cust_test12345234"
        customerName="Test McTestface"
        customerEmail="test@test.com"
      />
    </div>
  )
}

export default InternalDemoPage
