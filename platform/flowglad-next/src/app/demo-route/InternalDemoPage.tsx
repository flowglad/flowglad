'use client'

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
      <div></div>
    </div>
  )
}

export default InternalDemoPage
