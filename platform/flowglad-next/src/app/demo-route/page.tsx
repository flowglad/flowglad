import core from '@/utils/core'
import { notFound } from 'next/navigation'
import { OrganizationPaymentFailedNotificationEmail } from '@/email-templates/organization/organization-payment-failed'
import { CurrencyCode } from '@/types'

const RecurringProductWITHOUTTrialPeriod = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return (
    <OrganizationPaymentFailedNotificationEmail
      organizationName="Test Organization"
      amount={10000}
      invoiceNumber="1234567890"
      currency={CurrencyCode.USD}
      customerId="cus_12345"
      customerName="Test Customer"
    />
  )
}

export default RecurringProductWITHOUTTrialPeriod
