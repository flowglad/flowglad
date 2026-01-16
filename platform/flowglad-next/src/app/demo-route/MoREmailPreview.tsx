import { OrderReceiptEmail } from '@/email-templates/customer-order-receipt'
import { EmailPreviewWrapper } from './EmailPreviewWrapper'
import {
  commonOrganizationProps,
  DEFAULT_CURRENCY,
  mockCustomer,
  mockOrderLineItems,
  PREVIEW_REFERENCE_DATE,
} from './mockData'

interface MoREmailPreviewProps {
  isMoR?: boolean
  testMode?: boolean
}

export const MoREmailPreview = ({
  isMoR = true,
  testMode = false,
}: MoREmailPreviewProps) => {
  const scenario = isMoR
    ? 'Order receipt (Merchant of Record)'
    : 'Order receipt'

  // Calculate totals from line items
  const subtotal = mockOrderLineItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )
  const taxAmount = Math.round(subtotal * 0.08) // 8% tax for demo

  return (
    <EmailPreviewWrapper
      templateName="customer-order-receipt"
      scenario={scenario}
      testMode={testMode}
      emailType="order-receipt"
    >
      <OrderReceiptEmail
        invoiceNumber="INV-2024-001"
        orderDate={PREVIEW_REFERENCE_DATE.toLocaleDateString()}
        invoice={{
          subtotal,
          taxAmount,
          currency: DEFAULT_CURRENCY,
        }}
        lineItems={[...mockOrderLineItems]}
        organizationName={commonOrganizationProps.organizationName}
        organizationId={commonOrganizationProps.organizationId}
        customerId={mockCustomer.id}
        livemode={!testMode}
        isMoR={isMoR}
      />
    </EmailPreviewWrapper>
  )
}

export default MoREmailPreview
