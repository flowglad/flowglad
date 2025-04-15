'use client'

import Button from '@/components/ion/Button'
import { OrganizationSubscriptionCreatedNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import { trpc } from '../_trpc/client'

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
  const createUsageEvent = trpc.usageEvents.create.useMutation()
  return <Button onClick={async () => {}}>Test</Button>
}

export default InternalDemoPage
