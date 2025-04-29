import CheckoutPage from '@/components/CheckoutPage'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'
import { notFound } from 'next/navigation'

interface PurchasePageProps {
  params: Promise<{
    productId: string
  }>
}

const PurchasePage = async ({ params }: PurchasePageProps) => {
  const { productId } = await params
  const { checkoutInfo, success } = await checkoutInfoForPriceWhere({
    id: productId,
  })

  if (!success) {
    return notFound()
  }
  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default PurchasePage
