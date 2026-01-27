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
 *
 * ## Available Behaviors
 *
 * This module provides both granular and combined behaviors:
 *
 * - **initiateStripeConnectBehavior**: Just the initiation step (-> PartiallyOnboarded)
 * - **finalizeStripeOnboardingBehavior**: Just the completion step (-> FullyOnboarded)
 * - **completeStripeOnboardingBehavior**: Combined fast-forward (-> FullyOnboarded)
 *
 * Use the granular behaviors when testing intermediate states. Use the combined
 * behavior when you just need an onboarded organization for subsequent tests.
 */

import { adminTransaction } from '@/db/adminTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import {
  getStripeTestClient,
  getStripeTestModeSecretKey,
} from '@/test/stripeIntegrationHelpers'
import { BusinessOnboardingStatus } from '@/types'
import core from '@/utils/core'
import { defineBehavior } from '../index'
import type { CreateOrganizationResult } from './orgSetupBehaviors'

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of initiating Stripe Connect.
 *
 * Organization has a Stripe account but onboarding is not yet complete.
 */
export interface InitiateStripeConnectResult
  extends CreateOrganizationResult {
  /** The Stripe Connect account ID (format: `acct_*`) */
  stripeAccountId: string
}

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

// =============================================================================
// Granular Behaviors (Two-Step Flow)
// =============================================================================

/**
 * Initiate Stripe Connect Behavior
 *
 * Represents the user clicking "Connect with Stripe" to start onboarding.
 *
 * ## Real-World Flow
 *
 * In production, this involves:
 * 1. User clicks "Connect with Stripe" in the dashboard
 * 2. Flowglad creates a Stripe Connect account via API
 * 3. User is redirected to Stripe's hosted onboarding
 * 4. Organization is marked as PartiallyOnboarded
 *
 * The user is now in the middle of Stripe's onboarding flow.
 *
 * ## Test Simulation
 *
 * For testing, we skip the redirect and directly:
 * 1. Generate a test Stripe account ID
 * 2. Update organization to PartiallyOnboarded
 *
 * ## Postconditions
 *
 * - Organization has:
 *   - `stripeAccountId`: Linked Stripe Connect account (format: `acct_*`)
 *   - `onboardingStatus`: PartiallyOnboarded
 *   - `payoutsEnabled`: false
 * - Organization cannot yet process payments (onboarding incomplete)
 */
export const initiateStripeConnectBehavior = defineBehavior({
  name: 'initiate stripe connect',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateOrganizationResult
  ): Promise<InitiateStripeConnectResult> => {
    const stripeAccountId = `acct_test_${core.nanoid()}`

    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
            stripeAccountId,
            onboardingStatus:
              BusinessOnboardingStatus.PartiallyOnboarded,
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
        onboardingStatus: BusinessOnboardingStatus.PartiallyOnboarded,
      },
      stripeAccountId,
    }
  },
})

/**
 * Finalize Stripe Onboarding Behavior
 *
 * Represents Stripe sending the account.updated webhook indicating
 * onboarding is complete.
 *
 * ## Real-World Flow
 *
 * In production, this happens when:
 * 1. User completes all Stripe onboarding steps
 * 2. Stripe sends `account.updated` webhook
 * 3. Flowglad updates organization to FullyOnboarded
 *
 * ## Test Simulation
 *
 * For testing, we directly update the organization status.
 *
 * ## Postconditions
 *
 * - Organization has:
 *   - `onboardingStatus`: FullyOnboarded
 *   - `payoutsEnabled`: false (requires separate manual approval)
 * - Organization can now:
 *   - Create checkout sessions
 *   - Process payments
 */
export const finalizeStripeOnboardingBehavior = defineBehavior({
  name: 'finalize stripe onboarding',
  dependencies: [],
  run: async (
    _deps,
    prev: InitiateStripeConnectResult
  ): Promise<CompleteStripeOnboardingResult> => {
    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
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
        onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
      },
    }
  },
})

// =============================================================================
// Combined Behavior (Fast-Forward)
// =============================================================================

/**
 * Complete Stripe Onboarding Behavior (Fast-Forward)
 *
 * Represents the full Stripe Connect onboarding flow completing successfully,
 * including manual payout approval. This is a convenience behavior for tests
 * that need a fully operational organization.
 *
 * ## When to Use
 *
 * Use this when you need an organization that's ready to process payments,
 * but don't need to test intermediate onboarding states.
 *
 * For tests that verify PartiallyOnboarded state or verify that payouts
 * require separate approval, use the granular behaviors:
 * - `initiateStripeConnectBehavior`
 * - `finalizeStripeOnboardingBehavior`
 *
 * ## Postconditions
 *
 * - Organization has:
 *   - `stripeAccountId`: Linked Stripe Connect account (format: `acct_*`)
 *   - `onboardingStatus`: FullyOnboarded
 *   - `payoutsEnabled`: true (fast-forward includes payout approval)
 * - Organization can now:
 *   - Create checkout sessions
 *   - Process payments
 *   - Receive payouts
 */
export const completeStripeOnboardingBehavior = defineBehavior({
  name: 'complete stripe onboarding',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateOrganizationResult
  ): Promise<CompleteStripeOnboardingResult> => {
    // In integration test mode with real Stripe credentials, create a real
    // Stripe Connect account. Otherwise, use a fake account ID for unit tests.
    const hasRealStripeKey = !!getStripeTestModeSecretKey()

    let stripeAccountId: string
    if (hasRealStripeKey) {
      // Create a Custom Stripe Connect account for integration tests.
      // We use Custom accounts (requirement_collection: 'application') instead of
      // Express accounts because only Custom accounts allow programmatic TOS acceptance.
      // Express/Standard accounts require the user to complete Stripe's hosted onboarding.
      const stripe = getStripeTestClient()
      const stripeAccount = await stripe.accounts.create({
        country: prev.country.code,
        type: 'custom',
        capabilities: {
          transfers: { requested: true },
        },
        // Accept TOS at creation time (only works for Custom accounts)
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: '127.0.0.1',
        },
        // Minimal required info for a Custom account
        business_type: 'company',
        business_profile: {
          mcc: '5734', // Computer Software Stores
          url: 'https://example.com',
        },
        company: {
          name: prev.organization.name,
          tax_id: '000000000', // Test tax ID
        },
      })
      stripeAccountId = stripeAccount.id
    } else {
      // Use fake account ID for unit tests (no real Stripe calls)
      stripeAccountId = `acct_test_${core.nanoid()}`
    }

    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
            stripeAccountId,
            onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
            payoutsEnabled: true,
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
        payoutsEnabled: true,
      },
      stripeAccountId,
    }
  },
})
