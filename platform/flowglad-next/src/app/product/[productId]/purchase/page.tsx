import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CheckoutNotValidPage from '@/components/CheckoutNotValidPage'
import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { checkoutInfoForPriceWhere } from '@/utils/checkoutHelpers'

interface PurchasePageProps {
  params: Promise<{
    productId: string
  }>
}

export async function generateMetadata({
  params,
}: PurchasePageProps): Promise<Metadata> {
  const { productId } = await params

  try {
    const [{ product, organization }] = (
      await adminTransaction(async ({ transaction }) => {
        return await selectPriceProductAndOrganizationByPriceWhere(
          { productId, isDefault: true },
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
