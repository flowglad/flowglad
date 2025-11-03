import CheckoutPage from '@/components/CheckoutPage'
import core from '@/utils/core'
import { notFound } from 'next/navigation'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'
import CheckoutNotValidPage from '@/components/CheckoutNotValidPage'
import { Metadata } from 'next'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'

interface PurchasePageProps {
  params: Promise<{
    priceId: string
  }>
}

export async function generateMetadata({
  params,
}: PurchasePageProps): Promise<Metadata> {
  const { priceId } = await params

  try {
    const [{ product, organization }] = await adminTransaction(
      async ({ transaction }) => {
        return await selectPriceProductAndOrganizationByPriceWhere(
          { id: priceId },
          transaction
        )
      }
    )

    return {
      title: `${organization.name} | ${product.name}`,
    }
  } catch (error) {
    return {
      title: 'Checkout',
    }
  }
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
