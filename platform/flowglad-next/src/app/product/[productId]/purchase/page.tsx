import CheckoutNotValidPage from '@/components/CheckoutNotValidPage'
import CheckoutPage from '@/components/CheckoutPage'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'

interface PurchasePageProps {
  params: Promise<{
    productId: string
  }>
}

const PurchasePage = async ({ params }: PurchasePageProps) => {
  const { productId } = await params
  const { checkoutInfo, success, organization } =
    await checkoutInfoForPriceWhere({
      productId,
      isDefault: true,
    })

  if (!success) {
    return (
      <CheckoutNotValidPage organizationName={organization.name} />
    )
  }
  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default PurchasePage
