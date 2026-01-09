/**
 * Stripe Onboarding Behaviors
 *
 * Behaviors for Stripe Connect onboarding in behavior tests.
 */

import { adminTransaction } from '@/db/adminTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { BusinessOnboardingStatus } from '@/types'
import { defineBehavior } from '../index'
import type { CreateOrganizationResult } from './orgSetupBehaviors'

// ============================================================================
// Result Types
// ============================================================================

export interface CompleteStripeOnboardingResult
  extends CreateOrganizationResult {
  stripeAccountId: string
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Complete Stripe Onboarding Behavior
 *
 * Simulates the full Stripe Connect onboarding flow:
 * 1. Creates a Stripe Connect account
 * 2. Marks onboarding as PartiallyOnboarded
 * 3. Marks onboarding as FullyOnboarded
 *
 * This is a simplified version that combines the initiate and complete steps
 * for tests that don't need to test the intermediate states.
 *
 * Postconditions:
 * - Organization has stripeAccountId
 * - Organization status is FullyOnboarded
 * - payoutsEnabled remains false (requires manual approval)
 */
export const completeStripeOnboardingBehavior = defineBehavior({
  name: 'complete stripe onboarding',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateOrganizationResult
  ): Promise<CompleteStripeOnboardingResult> => {
    const stripeAccountId = `acct_test_${Date.now()}`

    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
            stripeAccountId,
            onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
          },
          transaction
        )
      },
      { livemode: true }
    )

    return {
      ...prev,
      organization: {
        ...prev.organization,
        stripeAccountId,
        onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
      },
      stripeAccountId,
    }
  },
})
