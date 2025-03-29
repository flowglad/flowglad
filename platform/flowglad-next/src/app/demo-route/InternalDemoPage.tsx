'use client'

import Button from '@/components/ion/Button'
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
  const inviteUserMutation =
    trpc.utils.inviteUserToOrganization.useMutation()
  return (
    <div style={{ padding: '20px' }}>
      <h1>Internal Demo Page</h1>
      <Button
        onClick={() =>
          inviteUserMutation.mutate({
            email: 'verybusyfounder@gmail.com',
          })
        }
      >
        Invite User
      </Button>
    </div>
  )
}

export default InternalDemoPage
