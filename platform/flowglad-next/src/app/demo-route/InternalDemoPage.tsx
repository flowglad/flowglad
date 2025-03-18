'use client'

import OrderReceiptEmail from '@/email-templates/customer-order-receipt'
import PaymentFailedEmail from '@/email-templates/customer-payment-failed'
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

  const { data } = trpc.subscriptions.list.useQuery({
    cursor:
      'eyJzZWxlY3RDb25kaXRpb25zIjp7fSwiY3JlYXRlZEF0IjoiMjAyNS0wMi0wN1QxODowMToxOS45NDNaIiwiZGlyZWN0aW9uIjoiZm9yd2FyZCJ9',
  })

  return (
    <div>
      <h1>Internal Demo Page</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

export default InternalDemoPage
