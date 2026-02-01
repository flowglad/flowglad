import { Result } from 'better-result'
import { redirect } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganizationAndPricingModel } from '@/db/tableMethods/membershipMethods'
import InnerPricingModelsPage from './InnerPricingModelsPage'

/**
 * Pricing Models list page that redirects to the focused pricing model's detail page.
 *
 * The redirect ensures users land directly on their current pricing model context,
 * providing a more contextual experience. Falls back to the list view if no focused
 * pricing model is found (edge case during onboarding or data inconsistency).
 */
export default async function PricingModelsPage() {
  try {
    const focusedMembership = (
      await authenticatedTransaction(
        async ({ transaction, userId }) => {
          const result =
            await selectFocusedMembershipAndOrganizationAndPricingModel(
              userId,
              transaction
            )
          return Result.ok(result)
        }
      )
    ).unwrap()

    if (focusedMembership?.pricingModel?.id) {
      redirect(`/pricing-models/${focusedMembership.pricingModel.id}`)
    }
  } catch {
    redirect('/dashboard')
  }

  return redirect('/dashboard')
}
