import { redirect } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { completeStripeOAuthFlow } from '@/utils/stripe'
import {
  decodeStripeOAuthState,
  validateAndConsumeStripeOAuthCsrfToken,
} from '@/utils/stripeOAuthState'

export default async function StripeOAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>
}) {
  const { code, state } = await searchParams

  // Require both code and state parameters
  if (!code || !state) {
    redirect('/dashboard')
  }

  try {
    // Step 1: Decode the state parameter to extract CSRF token
    const csrfToken = decodeStripeOAuthState(state)

    // Step 2: Get the current authenticated user
    const userId = await authenticatedTransaction(
      async ({ userId }) => userId
    )

    // Step 3: Validate and consume the CSRF token (single-use)
    const validation = await validateAndConsumeStripeOAuthCsrfToken({
      csrfToken,
      expectedUserId: userId,
    })

    if (!validation) {
      throw new Error('CSRF validation failed')
    }

    // Step 4: Complete the Stripe OAuth flow with the code
    const stripeResponse = await completeStripeOAuthFlow({ code })

    if (!stripeResponse.stripe_user_id) {
      throw new Error('Stripe OAuth response missing stripe_user_id')
    }

    // Step 5: Update the organization with the Stripe account ID
    await adminTransaction(async ({ transaction }) => {
      await updateOrganization(
        {
          id: validation.organizationId,
          stripeAccountId: stripeResponse.stripe_user_id,
        },
        transaction
      )
    })

    // Redirect to onboarding after successful connection
    redirect('/onboarding')
  } catch (error) {
    console.error('Error connecting Stripe account:', error)
    redirect('/onboarding?error=stripe_connection_failed')
  }
}
