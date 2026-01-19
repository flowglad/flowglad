import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
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
  livemode?: boolean
}

export const MoREmailPreview = ({
  isMoR = true,
  livemode = true,
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

  // Subject line depends on MoR status
  const subject = isMoR
    ? `Order Receipt #INV-2024-001 from ${FLOWGLAD_LEGAL_ENTITY.name} for ${commonOrganizationProps.organizationName}`
    : `${commonOrganizationProps.organizationName} Order Receipt: #INV-2024-001`

  const previewText = isMoR
    ? `Thanks for your order with ${commonOrganizationProps.organizationName}!`
    : 'Thanks for your order!'

  return (
    <EmailPreviewWrapper
      templateName="customer-order-receipt"
      scenario={scenario}
      subject={subject}
      previewText={previewText}
      livemode={livemode}
      emailType="order-receipt"
    >
      <OrderReceiptEmail
        invoiceNumber="INV-2024-001"
        orderDate={PREVIEW_REFERENCE_DATE.toISOString().slice(0, 10)}
        invoice={{
          subtotal,
          taxAmount,
          currency: DEFAULT_CURRENCY,
        }}
        lineItems={[...mockOrderLineItems]}
        organizationName={commonOrganizationProps.organizationName}
        organizationId={commonOrganizationProps.organizationId}
        customerId={mockCustomer.id}
        livemode={livemode}
        isMoR={isMoR}
      />
    </EmailPreviewWrapper>
  )
}

export default MoREmailPreview
