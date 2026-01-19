import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CheckoutNotValidPage from '@/components/CheckoutNotValidPage'
import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'
import core from '@/utils/core'

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
    const [{ product, organization }] = (
      await adminTransaction(async ({ transaction }) => {
        return await selectPriceProductAndOrganizationByPriceWhere(
          { id: priceId },
          transaction
        )
      })
    ).unwrap()

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
