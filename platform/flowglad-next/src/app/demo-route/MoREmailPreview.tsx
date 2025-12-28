import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import type { CurrencyCode } from '@/types'

const mockOrderLineItems = [
  { name: 'Pro Plan Subscription', price: 4900, quantity: 1 },
  { name: 'Additional API Calls', price: 5000, quantity: 1 },
]

export const MoREmailPreview = ({
  isMoR = true,
}: {
  isMoR?: boolean
}) => {
  const organizationName = 'Acme Corp'

  return (
    <div className="p-4">
      <div className="mb-4 text-sm text-gray-600">
        <strong>Template:</strong> order-receipt |{' '}
        <strong>MoR Mode:</strong> {isMoR ? 'Yes' : 'No'}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <OrderReceiptEmail
          invoiceNumber="INV-2024-001"
          orderDate={new Date().toLocaleDateString()}
          invoice={{
            subtotal: 9900,
            taxAmount: 792,
            currency: 'USD' as CurrencyCode,
          }}
          lineItems={mockOrderLineItems}
          organizationName={organizationName}
          organizationId="org_mock123"
          customerId="cus_mock123"
          livemode={true}
          isMoR={isMoR}
        />
      </div>
    </div>
  )
}

export default MoREmailPreview
