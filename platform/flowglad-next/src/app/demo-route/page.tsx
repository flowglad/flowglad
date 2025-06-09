import core from '@/utils/core'
import { notFound } from 'next/navigation'
import { OrganizationPaymentFailedNotificationEmail } from '@/email-templates/organization/organization-payment-failed'
import { CurrencyCode } from '@/types'

const DemoPage = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return (
    <OrganizationPaymentFailedNotificationEmail
      organizationName="Test Organization"
      amount={5000}
      currency={CurrencyCode.USD}
      customerId="cus_test123"
      customerName="Test Customer"
      invoiceNumber="inv_test123"
    />
  )
}

export default DemoPage
