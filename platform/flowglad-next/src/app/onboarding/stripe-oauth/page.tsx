import { redirect } from 'next/navigation'
import { authenticatedTransactionUnwrap } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { getStripeOAuthUrl } from '@/utils/stripe'
import {
  createStripeOAuthCsrfToken,
  encodeStripeOAuthState,
} from '@/utils/stripeOAuthState'

export default async function StripeOAuthPage() {
  const result = await authenticatedTransactionUnwrap(
    async ({ transaction, userId }) => {
      const focusedMembership =
        await selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )

      if (!focusedMembership) {
        return null
      }

      return {
        userId,
        organizationId: focusedMembership.membership.organizationId,
      }
    }
  )

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
