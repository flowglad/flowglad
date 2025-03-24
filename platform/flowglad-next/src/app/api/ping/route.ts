import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { selectPricesProductsAndCatalogsForOrganization } from '@/db/tableMethods/priceMethods'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const results = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      const focusedMembership =
        await selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
      const productsResult =
        await selectPricesProductsAndCatalogsForOrganization(
          {},
          focusedMembership.organization.id,
          transaction
        )
      return productsResult
    }
  )
  return NextResponse.json({
    message: 'pong',
    results,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  })
}
