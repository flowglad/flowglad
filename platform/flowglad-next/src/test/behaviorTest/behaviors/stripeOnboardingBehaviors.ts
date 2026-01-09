/**
 * Stripe Onboarding Behaviors
 *
 * Behaviors representing Stripe Connect onboarding for organizations.
 *
 * ## Product Context
 *
 * Flowglad uses Stripe Connect to process payments on behalf of organizations.
 * Before an organization can receive payments or payouts, they must complete
 * Stripe's onboarding process, which verifies their identity and business
 * information.
 *
 * ## User Journey
 *
 * After creating an organization, users are prompted to "Connect with Stripe".
 * This redirects them to Stripe's hosted onboarding flow where they provide:
 * - Business information (name, address, tax ID)
 * - Bank account for payouts
 * - Identity verification (for certain regions)
 *
 * ## Onboarding States
 *
 * Organizations progress through these states:
 * 1. **Unauthorized**: No Stripe connection initiated
 * 2. **PartiallyOnboarded**: Stripe account created, onboarding in progress
 * 3. **FullyOnboarded**: Stripe onboarding complete, can process payments
 *
 * Note: `payoutsEnabled` is separate from onboarding status and requires
 * manual approval from Flowglad after reviewing the organization.
 */

import { adminTransaction } from '@/db/adminTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { BusinessOnboardingStatus } from '@/types'
import { defineBehavior } from '../index'
import type { CreateOrganizationResult } from './orgSetupBehaviors'

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of completing Stripe onboarding.
 *
 * Extends organization setup with the Stripe account linkage required
 * for payment processing.
 */
export interface CompleteStripeOnboardingResult
  extends CreateOrganizationResult {
  /** The Stripe Connect account ID (format: `acct_*`) */
  stripeAccountId: string
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Complete Stripe Onboarding Behavior
 *
 * Represents the full Stripe Connect onboarding flow completing successfully.
 *
 * ## Real-World Flow
 *
 * In production, this involves:
 * 1. User clicks "Connect with Stripe" in the dashboard
 * 2. Flowglad creates a Stripe Connect account via API
 * 3. User is redirected to Stripe's hosted onboarding
 * 4. User completes identity/business verification
 * 5. Stripe sends `account.updated` webhook
 * 6. Flowglad updates organization status to FullyOnboarded
 *
 * ## Test Simulation
 *
 * For testing, we skip the redirect flow and directly:
 * 1. Generate a test Stripe account ID
 * 2. Update the organization to FullyOnboarded status
 *
 * This is a "fast forward" behavior that combines initiate + complete.
 * For tests that need to verify intermediate states (PartiallyOnboarded),
 * use separate initiate and complete behaviors.
 *
 * ## Postconditions
 *
 * - Organization has:
 *   - `stripeAccountId`: Linked Stripe Connect account (format: `acct_*`)
 *   - `onboardingStatus`: FullyOnboarded
 *   - `payoutsEnabled`: false (requires separate manual approval)
 * - Organization can now:
 *   - Create checkout sessions
 *   - Process payments
 *   - (But not receive payouts until manually approved)
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
