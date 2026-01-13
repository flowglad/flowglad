# Behavior Test Creation Prompt

You are creating a **behavior test** for the Flowglad application. Behavior tests verify that business logic behaves correctly across all valid combinations of configuration variants (the "cartesian product").

## What is a Behavior Test?

A behavior test models a **user journey as a chain of discrete behaviors**, where each behavior:
1. Takes input from the previous behavior's result
2. Performs a single logical action (e.g., "create organization", "provide billing address")
3. Returns a result that accumulates state for subsequent behaviors
4. Is validated by **universal invariants** that must hold across ALL dependency combinations

The framework runs the entire chain once for each combination of dependency implementations, asserting invariants at every step.

## When to Use Behavior Tests

Use behavior tests when:
- A user flow has **multiple valid configurations** that should all work
- You need to verify **invariants hold universally** regardless of configuration
- The same flow should behave **consistently but differently** based on variants
- You want to catch regressions when new variants are added

Examples:
- User sign-up across different countries and contract types
- Checkout flow for MOR vs Platform merchants
- Subscription creation with different billing intervals
- Payment processing with different payment methods

## Key Concepts

### 1. Dependencies (Variants)

Dependencies define the **axes of variation** in your test. Each dependency has multiple implementations that represent different valid configurations.

```typescript
// Define a dependency interface and abstract class
interface CountryConfig {
  countryCode: CountryCode
  expectedCurrency: CurrencyCode
}

abstract class CountryDep extends Dependency<CountryConfig>() {
  abstract countryCode: CountryCode
  abstract expectedCurrency: CurrencyCode
}

// Register implementations for each variant
CountryDep.implement('us', {
  countryCode: CountryCode.US,
  expectedCurrency: CurrencyCode.USD,
})

CountryDep.implement('de', {
  countryCode: CountryCode.DE,
  expectedCurrency: CurrencyCode.EUR,
})
```

**How to identify dependencies:**
- Ask: "What configurations could vary while the flow should still work?"
- Look for: countries, payment methods, contract types, billing intervals, user roles, feature flags
- Each dependency should represent a **meaningful business dimension**, not arbitrary test data

### 2. Behaviors (Steps)

A behavior is a **single logical step** in a user journey. It should:
- Have a clear, action-oriented name (verb + noun): "authenticate user", "create organization", "provide billing address"
- Accept dependencies it needs and the previous step's result
- Return a result that extends the previous result (accumulating state)
- Be reusable across different test files

```typescript
const createProductBehavior = defineBehavior({
  name: 'create product with price',
  dependencies: [],  // List dependency classes this behavior needs
  run: async (_deps, prev: PreviousResult): Promise<CurrentResult> => {
    // Perform the action
    const product = await createProduct(...)

    // Return accumulated state
    return {
      ...prev,      // Preserve all previous state
      product,      // Add new state from this step
    }
  },
})
```

**Scoping a behavior correctly:**
- **Too small**: "insert user row", "insert membership row" — These are implementation details, not user-visible steps
- **Just right**: "authenticate user", "create organization" — Maps to a user action or system event
- **Too large**: "complete entire checkout flow" — Should be broken into discrete steps

**Good behavior scope examples:**
- "authenticate user" — User signs in, gets a session
- "create organization" — User creates their business account
- "initiate stripe connect" — User clicks "Connect to Stripe"
- "complete stripe onboarding" — Stripe webhook confirms onboarding done
- "provide billing address" — Customer enters their address at checkout
- "confirm payment" — Customer clicks "Pay Now"

### 3. Invariants (Assertions)

Invariants are assertions that must hold **universally** across all dependency combinations. They're checked after each behavior executes.

```typescript
{
  behavior: createOrganizationBehavior,
  invariants: async (result, combination) => {
    // Universal invariants (always true)
    expect(result.organization.id).toMatch(/^org_/)
    expect(result.membership.userId).toBe(result.user.id)

    // Variant-specific invariants (depend on combination)
    const countryDep = CountryDep.get(combination.CountryDep)
    if (countryDep.countryCode === CountryCode.US) {
      expect(result.organization.defaultCurrency).toBe(CurrencyCode.USD)
    }
  },
}
```

**Types of invariants:**
1. **Universal**: Must hold for ALL combinations
   - "Organization ID always starts with 'org_'"
   - "User is always linked to organization via membership"

2. **Conditional**: Depend on the specific combination
   - "MOR orgs get fee calculation; Platform orgs get null"
   - "US orgs use USD; DE orgs use EUR"

### 4. Result Types (Accumulated State)

Each behavior returns a result type that extends the previous one:

```typescript
interface AuthenticateUserResult {
  user: User.Record
}

interface CreateOrganizationResult extends AuthenticateUserResult {
  organization: Organization.Record
  membership: Membership.Record
  country: Country.Record
}

interface CompleteOnboardingResult extends CreateOrganizationResult {
  stripeAccountId: string
}
```

This creates a **type-safe chain** where each step can access all data from previous steps.

## File Structure

```
src/test/behaviorTest/
├── index.ts                           # Framework exports
├── behaviors/
│   └── organizationBehaviors.ts       # Shared reusable behaviors
├── userSignUp.behavior.test.ts        # Test file
└── morCheckout.behavior.test.ts       # Test file
```

**Naming conventions:**
- Test files: `<feature>.behavior.test.ts`
- Shared behaviors: `behaviors/<domain>Behaviors.ts`
- Dependencies: `<Name>Dep` (e.g., `CountryDep`, `BillingModeDep`)
- Behaviors: `<action>Behavior` (e.g., `authenticateUserBehavior`)

## Complete Test Structure

```typescript
/**
 * <Feature> Behavior Test
 *
 * Tests <description of what this tests>.
 *
 * Chain:
 * 1. <Behavior 1> - <what it does>
 * 2. <Behavior 2> - <what it does>
 * ...
 *
 * Key invariant: <the main thing being verified>
 */

import { expect } from 'vitest'
import { behaviorTest, Dependency, defineBehavior } from './index'
import { teardownOrg } from '@/../seedDatabase'

// ============================================================================
// Result Types
// ============================================================================

interface Step1Result {
  // Fields created by step 1
}

interface Step2Result extends Step1Result {
  // Fields added by step 2
}

// ============================================================================
// Dependency Definitions
// ============================================================================

interface MyDepConfig {
  someValue: string
  expectedOutcome: boolean
}

abstract class MyDep extends Dependency<MyDepConfig>() {
  abstract someValue: string
  abstract expectedOutcome: boolean
}

// ============================================================================
// Dependency Implementations
// ============================================================================

MyDep.implement('variant1', {
  someValue: 'foo',
  expectedOutcome: true,
})

MyDep.implement('variant2', {
  someValue: 'bar',
  expectedOutcome: false,
})

// ============================================================================
// Behavior Definitions
// ============================================================================

const step1Behavior = defineBehavior({
  name: 'step 1 name',
  dependencies: [MyDep],
  run: async ({ myDep }, _prev: undefined): Promise<Step1Result> => {
    // Implementation
    return { /* result */ }
  },
})

const step2Behavior = defineBehavior({
  name: 'step 2 name',
  dependencies: [],
  run: async (_deps, prev: Step1Result): Promise<Step2Result> => {
    // Implementation uses prev.* from step 1
    return { ...prev, /* new fields */ }
  },
})

// ============================================================================
// Behavior Test
// ============================================================================

behaviorTest({
  chain: [
    {
      behavior: step1Behavior,
      invariants: async (result, combination) => {
        // Assertions for step 1
      },
    },
    {
      behavior: step2Behavior,
      invariants: async (result, combination) => {
        // Assertions for step 2
        // Can access result.* from step 1 AND step 2
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: async (results) => {
    // Cleanup created resources
    for (const result of results as Step2Result[]) {
      if (result?.organization?.id) {
        await teardownOrg({ organizationId: result.organization.id })
      }
    }
  },
})
```

## Reusing Shared Behaviors

Import from `./behaviors/organizationBehaviors.ts`:

```typescript
import {
  authenticateUserBehavior,
  createOrganizationBehavior,
  completeStripeOnboardingBehavior,
  CountryDep,
  ContractTypeDep,
  type AuthenticateUserResult,
  type CreateOrganizationResult,
  type CompleteStripeOnboardingResult,
} from './behaviors/organizationBehaviors'
```

These provide common setup steps so you can focus on testing the specific flow you care about.

## Detecting Dependencies vs Hardcoded Values

**Ask yourself:**
1. Does this value affect business logic? → **Dependency**
2. Is this just test data with no behavioral impact? → **Hardcoded**

**Examples:**

| Value | Dependency or Hardcoded? | Reason |
|-------|-------------------------|--------|
| Country | Dependency | Affects currency, tax rules, eligibility |
| Contract type (MOR/Platform) | Dependency | Affects fee calculation, payment flow |
| Customer email | Hardcoded | No business logic depends on specific email |
| Product name | Hardcoded | Just test data, doesn't change behavior |
| Price amount | Usually hardcoded | Unless testing price-tier behavior |
| Billing interval | Dependency | Affects billing cycles, proration |

## Detecting Universal vs Conditional Invariants

**Universal invariants** (always assert):
- ID format validation
- Required relationships exist (user → membership → org)
- Status transitions are valid
- Required fields are populated

**Conditional invariants** (check combination first):
- Currency matches country for Platform; USD for MOR
- Fee calculation exists for MOR; null for Platform
- Tax calculated for taxable jurisdictions; zero for exempt

```typescript
invariants: async (result, combination) => {
  // UNIVERSAL: Always true
  expect(result.organization.id).toMatch(/^org_/)

  // CONDITIONAL: Depends on variant
  const billingModeDep = BillingModeDep.get(combination.BillingModeDep)
  if (billingModeDep.expectsFeeCalculation) {
    expect(result.feeCalculation).not.toBeNull()
  } else {
    expect(result.feeCalculation).toBeNull()
  }
}
```

## Filtered Behavior Tests vs Integration Tests

**Critical principle**: For any assertion that's not universal over every variant:
- Create a **filtered behavior test** for a subset of the cartesian product
- Or create a **single integration test** for a single combination

### When to Use Filtered Behavior Tests

Use the `only` parameter to run a behavior test against a subset of combinations:

```typescript
// Test MoR-specific behavior across all countries and residencies
behaviorTest({
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: provideBillingAddressBehavior,
      invariants: async (result) => {
        // These assertions only make sense for MoR
        expect(result.feeCalculation).not.toBeNull()
        expect(result.feeCalculation!.flowgladFeePercentage).toBe('0.65')
      },
    },
  ],
  // Only run for MoR contract type
  only: [{ ContractTypeDep: 'merchantOfRecord' }],
})

// Test VAT jurisdictions specifically
behaviorTest({
  chain: [...],
  only: [
    { ContractTypeDep: 'merchantOfRecord', CustomerResidencyDep: 'uk-london' },
    { ContractTypeDep: 'merchantOfRecord', CustomerResidencyDep: 'de-berlin' },
  ],
})
```

### When to Use Integration Tests Instead

Use a regular integration test when:
- Testing a very specific combination that doesn't generalize
- The assertion is highly specific to one exact configuration
- You need to test edge cases not covered by the dependency matrix

```typescript
// integration test for a specific scenario
it('should calculate NYC tax correctly for MoR US org', async () => {
  // Set up specific combination manually
  const org = await setupOrg({ country: 'US', contractType: 'MoR' })
  const result = await checkout({ billingAddress: NYC_ADDRESS })

  // Very specific assertion
  expect(result.feeCalculation.taxAmountFixed).toBe(444) // Exact cents
})
```

### Decision Guide

| Scenario | Test Type |
|----------|-----------|
| Assertion true for ALL combinations | Universal invariant in main behaviorTest |
| Assertion true for a subset (e.g., all MoR) | Filtered behaviorTest with `only` |
| Assertion true for multiple specific combos | Filtered behaviorTest listing combos in `only` |
| Assertion for ONE specific combo with exact values | Integration test |
| Testing edge cases or error paths | Integration test |

## Integration Behavior Tests

For behaviors that require external APIs (like Stripe), use the `describeFunction` option
to conditionally run tests based on available credentials.

```typescript
import { describeIfStripeKey } from '@/test/stripeIntegrationHelpers'

behaviorTest({
  describeFunction: describeIfStripeKey,
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: confirmCheckoutWithRealStripe },
    {
      behavior: processPaymentSuccessBehavior,
      invariants: async (result) => {
        expect(result.purchase).not.toBeNull()
        expect(result.payment.status).toBe(PaymentStatus.Succeeded)
      },
    },
  ],
  only: [{ ContractTypeDep: 'merchantOfRecord', CountryDep: 'us' }],
  testOptions: { timeout: 120000 },
  teardown: integrationTeardown,
})
```

The `describeFunction` option accepts any function with the signature `(name: string, fn: () => void) => void`.
Common use cases:

- `describeIfStripeKey`: Skip tests when `STRIPE_TEST_MODE_SECRET_KEY` is not set
- Custom wrappers for other external service credentials
- `describe.skip`: Always skip (useful during development)

When using integration behaviors:
- Put them in a separate file (e.g., `*.integration.behavior.test.ts`)
- Use longer timeouts (real API calls take time)
- Always clean up external resources in teardown

## Common Pitfalls

1. **Too many dependencies**: Start with 2-3. Each dependency multiplies test count.
2. **Behaviors too granular**: Test user-visible steps, not DB operations.
3. **Missing teardown**: Always clean up created resources.
4. **Hardcoded waits**: Use proper async patterns, not `setTimeout`.
5. **Non-unique test data**: Use `core.nanoid()` for names to avoid collisions.
6. **Conditional assertions in universal tests**: If you find yourself writing `if (combination.X === 'foo')`, consider a filtered behavior test instead.

## Questions to Answer Before Writing

Before implementing, clarify:

1. **What user journey are you testing?** Describe the flow from the user's perspective.

2. **What are the key invariants?** What must ALWAYS be true after each step?

3. **What are the dependency axes?** What configurations should this flow support?

4. **What existing behaviors can you reuse?** Check `behaviors/` for common setup steps.

5. **What's the key business logic being verified?** What would break if a bug was introduced?

---

## Your Task

The user will describe a user experience area or flow immediately after this prompt. Based on their description:

1. Ask clarifying questions if any part of the flow is unclear
2. Identify the behaviors (steps) in the chain
3. Identify dependencies (what configurations should be tested)
4. Identify key invariants (what must always be true)
5. Implement the test following the structure above
6. Ensure tests pass with `bunx vitest run <your-test-file>`
