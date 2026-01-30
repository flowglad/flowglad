import { Result } from 'better-result'
import { redirect } from 'next/navigation'
import { authenticatedTransactionWithResult } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { getStripeOAuthUrl } from '@/utils/stripe'
import {
  createStripeOAuthCsrfToken,
  encodeStripeOAuthState,
} from '@/utils/stripeOAuthState'

export default async function StripeOAuthPage() {
  const result = (
    await authenticatedTransactionWithResult(
      async ({ transaction, userId }) => {
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )

        if (!focusedMembership) {
          return Result.ok(null)
        }

        return Result.ok({
          userId,
          organizationId: focusedMembership.membership.organizationId,
        })
      }
    )
  ).unwrap()

  if (!result) {
    redirect('/dashboard')
  }

  // Create CSRF token and store in Redis
  const csrfToken = await createStripeOAuthCsrfToken({
    userId: result.userId,
    organizationId: result.organizationId,
  })

  // Encode for URL state parameter
  const state = encodeStripeOAuthState(csrfToken)

  redirect(getStripeOAuthUrl(state))
}
