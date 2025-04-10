'use client'

import Button from '@/components/ion/Button'
import { trpc } from '../_trpc/client'
import { IntervalUnit, PriceType } from '@/types'

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

  const { data: customersData } = trpc.customers.list.useQuery({})
  const createSubscriptionMutation =
    trpc.subscriptions.create.useMutation()
  const { data: pricesData } = trpc.prices.list.useQuery({})
  return (
    <div style={{ padding: '20px' }}>
      <h1>Internal Demo Page</h1>
      <Button
        onClick={async () => {
          if (!customersData?.data.length) {
            return
          }
          const customer = customersData.data[0]
          await createSubscriptionMutation.mutateAsync({
            customerId: customer.id,
            priceId: 'price_GCiIbo6Q8sVeEkAgTu1tW',
            trialEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          })
        }}
      >
        Create Customer
      </Button>
    </div>
  )
}

export default InternalDemoPage
