import type { Metadata } from 'next'
import FailurePageContainer from '@/components/FailurePageContainer'

export const metadata: Metadata = {
  title: 'Payment Failed',
  description: 'There was an issue processing your payment',
}

const CheckoutFailurePage = () => {
  return (
    <FailurePageContainer
      title="Payment Failed"
      message="We were unable to process your payment. Please try again or contact support if the issue persists."
    />
  )
}

export default CheckoutFailurePage
