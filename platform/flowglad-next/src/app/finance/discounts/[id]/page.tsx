import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectDiscountById,
  selectDiscounts,
} from '@/db/tableMethods/discountMethods'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

const DiscountsPage = async ({ params }: PageProps) => {
  const { id } = await params
  const discount = await authenticatedTransaction(
    async ({ transaction }) => {
      return selectDiscountById(id, transaction)
    }
  )

  return <div>DiscountsPage: {discount?.name}</div>
}

export default DiscountsPage
