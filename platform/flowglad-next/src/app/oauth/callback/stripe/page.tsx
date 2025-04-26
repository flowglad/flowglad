import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { adminTransaction } from '@/db/adminTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { completeStripeOAuthFlow } from '@/utils/stripe'
import { redirect } from 'next/navigation'

export default async function StripeOAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams

  if (!code) {
    redirect('/dashboard')
  }

  try {
    // Step 1: Complete the Stripe OAuth flow with the code
    const stripeResponse = await completeStripeOAuthFlow({ code })

    // Step 2: Get the focused membership to identify the organization
    const focusedMembership = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        return selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
      }
    )

    if (!focusedMembership) {
      throw new Error('No focused membership found')
    }

    // Step 3: Update the organization with the Stripe account ID
    await adminTransaction(async ({ transaction }) => {
      await updateOrganization(
        {
          id: focusedMembership.membership.organizationId,
          stripeAccountId: stripeResponse.stripe_user_id,
        },
        transaction
      )
    })

    // Redirect to dashboard after successful connection
    redirect('/onboarding')
  } catch (error) {
    console.error('Error connecting Stripe account:', error)
    redirect('/onboarding?error=stripe_connection_failed')
  }
}
