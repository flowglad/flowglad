import FailurePageContainer from '@/components/FailurePageContainer'

const CheckoutFailurePage = () => {
  return (
    <FailurePageContainer
      title="Payment Failed"
      message="We were unable to process your payment. Please try again or contact support if the issue persists."
    />
  )
}

export default CheckoutFailurePage
