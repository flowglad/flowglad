import { redirect } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { getStripeOAuthUrl } from '@/utils/stripe'

export default async function StripeOAuthPage() {
  const focusedMembership = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      return selectFocusedMembershipAndOrganization(
        userId,
        transaction
      )
    }
  )

  if (!focusedMembership) {
    redirect('/dashboard')
  }

  redirect(
    getStripeOAuthUrl(focusedMembership.membership.organizationId)
  )
}
