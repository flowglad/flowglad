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

  const result = await authenticatedTransaction(
    async ({ transaction }) => {
      let discount
      try {
        discount = await selectDiscountById(id, transaction)
      } catch (error) {
        // Only treat "not found" errors as expected; let other DB failures propagate
        if (
          error instanceof Error &&
          error.message.includes('No discounts found')
        ) {
          return null
        }
        throw error
      }

      // Get redemption count for this discount
      const [redemptionResult] = await transaction
        .select({
          count: count(),
        })
        .from(discountRedemptions)
        .where(eq(discountRedemptions.discountId, id))

      return {
        discount,
        redemptionCount: redemptionResult?.count ?? 0,
      }
    }
  )

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
