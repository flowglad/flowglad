import CheckoutPage from '@/components/CheckoutPage'
import core from '@/utils/core'
import { notFound } from 'next/navigation'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'

interface PurchasePageProps {
  params: Promise<{
    priceId: string
  }>
}

const PricePurchasePage = async ({ params }: PurchasePageProps) => {
  if (core.IS_PROD) {
    return notFound()
  }
  const { priceId } = await params
  const { checkoutInfo, success } = await checkoutInfoForPriceWhere({
    id: priceId,
  })
  if (!success) {
    return notFound()
  }
  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default PricePurchasePage
