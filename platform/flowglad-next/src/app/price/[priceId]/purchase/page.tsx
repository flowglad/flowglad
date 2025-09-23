import CheckoutPage from '@/components/CheckoutPage'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'
import CheckoutNotValidPage from '@/components/CheckoutNotValidPage'

interface PurchasePageProps {
  params: Promise<{
    priceId: string
  }>
}

const PricePurchasePage = async ({ params }: PurchasePageProps) => {
  const { priceId } = await params
  const { checkoutInfo, success, organization } =
    await checkoutInfoForPriceWhere({
      id: priceId,
    })
  if (!success) {
    return (
      <CheckoutNotValidPage organizationName={organization.name} />
    )
  }
  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default PricePurchasePage
