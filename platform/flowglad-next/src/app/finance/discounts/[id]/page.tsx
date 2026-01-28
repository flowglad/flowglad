import { Result } from 'better-result'
import { count, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import InnerDiscountDetailsPage from './InnerDiscountDetailsPage'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

const DiscountPage = async ({ params }: PageProps) => {
  const { id } = await params

  const txResult = await authenticatedTransaction(
    async ({ transaction }) => {
      const discountResult = await selectDiscountById(id, transaction)
      if (Result.isError(discountResult)) {
        return Result.ok(null)
      }
      const discount = discountResult.unwrap()

      // Get redemption count for this discount
      const [redemptionResult] = await transaction
        .select({
          count: count(),
        })
        .from(discountRedemptions)
        .where(eq(discountRedemptions.discountId, id))

      return Result.ok({
        discount,
        redemptionCount: redemptionResult?.count ?? 0,
      })
    }
  )
  const result = txResult.unwrap()

  if (!result) {
    notFound()
  }

  return (
    <InnerDiscountDetailsPage
      discount={result.discount}
      redemptionCount={result.redemptionCount}
    />
  )
}

export default DiscountPage
