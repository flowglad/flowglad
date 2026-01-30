import { discountRedemptions } from '@db-core/schema/discountRedemptions'
import { Result } from 'better-result'
import { count, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { authenticatedTransactionWithResult } from '@/db/authenticatedTransaction'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import InnerDiscountDetailsPage from './InnerDiscountDetailsPage'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

const DiscountPage = async ({ params }: PageProps) => {
  const { id } = await params

  const result = (
    await authenticatedTransactionWithResult(
      async ({ transaction }) => {
        const discountResult = await selectDiscountById(
          id,
          transaction
        )
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
  ).unwrap()

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
