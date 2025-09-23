import PostPaymentSidebar from '@/components/checkout/post-payment-sidebar'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPurchaseCheckoutParametersById } from '@/db/tableMethods/purchaseMethods'

const PurchaseAccessLayout = async ({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ purchaseId: string }>
}) => {
  const { purchaseId } = await params
  const { organization } = await adminTransaction(
    async ({ transaction }) => {
      const { organization } =
        await selectPurchaseCheckoutParametersById(
          purchaseId,
          transaction
        )
      return { organization }
    }
  )

  return (
    <div className="bg-background h-full w-full flex justify-between items-center">
      <PostPaymentSidebar organization={organization} />
      {children}
    </div>
  )
}

export default PurchaseAccessLayout
