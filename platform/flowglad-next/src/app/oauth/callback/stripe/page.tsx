import { redirect } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import {
  completeStripeOAuthFlow,
  decodeStripeOAuthState,
} from '@/utils/stripe'

export default async function StripeOAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>
}) {
  const { code, state } = await searchParams

  if (!code || !state) {
    redirect('/dashboard')
  }

  try {
    const { organizationId } = decodeStripeOAuthState(state)

    // Step 1: Verify the user has access to the organization from state
    const membership = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const [membership] = await selectMemberships(
          { userId, organizationId },
          transaction
        )
        return membership
      }
    )

    if (!membership) {
      throw new Error(
        'Unauthorized: user not a member of organization'
      )
    }

    // Step 2: Complete the Stripe OAuth flow with the code
    const stripeResponse = await completeStripeOAuthFlow({ code })
    const stripeAccountId = stripeResponse.stripe_user_id
    if (!stripeAccountId) {
      throw new Error('Stripe OAuth response missing stripe_user_id')
    }

    // Step 3: Update the organization with the Stripe account ID
    await adminTransaction(async ({ transaction }) => {
      await updateOrganization(
        {
          id: organizationId,
          stripeAccountId: stripeAccountId,
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
