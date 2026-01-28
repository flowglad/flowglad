We are planning to undertake a relatively complex change to this codebase. We need you to come up with a plan that helps us all align as a team on:
- what is the current state of this part of the codebase
- what work needs to be done
- what are the acceptance criteria
- what cases must we have test coverage for before we land the changes into main?
- how to break this work into patches?
- how can the patches be parallelized?
- what open questions do we have?
- what formal decisions have we made so far?

The goal is to produce a markdown file that the team can review and "approve", so that the engineer can go off and have the whole thing implemented using AI coding agents as quickly as possible.

Note that this should be easy to review, and not super voluminuous - the whole idea is that it's 5-10x easier to scrutinize a markdown describe planned code than reviewing the actual lines of code themselves!

## Workstream Context (Optional)

A gameplan can be **standalone** or part of a **workstream**. A workstream is a larger project spanning weeks or months, broken into multiple gameplans as milestones.

**If the user provides a workstream reference** (a Notion URL or workstream name):
1. Fetch the workstream from Notion to understand the broader project context
2. Identify which milestone this gameplan corresponds to
3. Review the milestone's "Definition of Done" - this should inform your acceptance criteria
4. Consider what prior milestones have been completed and what this gameplan unlocks
5. Ensure your gameplan leaves the codebase in a consistent state (a key workstream requirement)

**If no workstream is provided**, treat this as a standalone gameplan. Most gameplans are self-contained.

When part of a workstream, include a "Workstream" field in your output (see format below).

Roughly, the shape should be:

- Project Name
  A short, kebab-case identifier for this gameplan (e.g., `subscription-adjustments`, `usage-billing-v2`).
  This name is used in branch names and PR titles to identify which gameplan a patch belongs to.

- Workstream (if applicable)
  If this gameplan is part of a workstream, include:
  - **Name**: The workstream name
  - **Milestone**: Which milestone this gameplan fulfills (e.g., "Milestone 3: refactor-billing-engine")
  - **Prior milestones**: Brief note on what's already been completed
  - **This milestone unlocks**: What becomes possible after this gameplan

- Problem Statement
  A concise (2-4 sentences) description of what problem we're solving and why.

- Solution Summary
  A concise (3-5 sentences) high-level description of how we're solving it.

- Mergability Strategy
  **Principle**: Maximize early code shipping by deferring observable behavior changes. Ship types, schemas, refactors, and test stubs early. Defer behavior changes to later patches where they can be reviewed with full context.

  ### Feature Flagging Strategy

  If your gameplan introduces new behavior that should be gated or gradually rolled out, document your feature flagging approach here.

  **Database Feature Flags** (per-organization gating)
  Use when: Gradual rollout to specific organizations, A/B testing, customer-specific enablement.
  - `hasFeatureFlag(organization, flag)` - Check if an org has a flag enabled
  - `featureFlaggedProcedure(flag)` - TRPC procedure factory that requires the flag
  - Flags are stored in `organizations.featureFlags` JSONB column
  - Add new flags to the `FeatureFlag` enum in `src/types.ts`

  **Environment Variable Flags** (global on/off)
  Use when: Global feature toggles, CI/testing behavior, deployment-specific configuration.
  - Checked via `process.env.FLAG_NAME` directly
  - Pattern: `const isEnabled = process.env.ENABLE_FEATURE === 'true'`
  - No database access required, available at module load time

  **Feature Flag Template** (include if using flags):
  ```
  Flag Type: [Database | Environment Variable]
  Flag Name: [ENABLE_MY_FEATURE or FeatureFlag.MyFeature]
  Introduced: Patch N (as [INFRA] - adding the flag itself)
  Activated: Patch M (as [BEHAVIOR] - wiring up the flag)
  ```

  ### Patch Ordering Strategy

  Order patches to ship non-functional changes early:

  **Early Patches** (ship first, no behavior change):
  - New types, interfaces, schemas
  - Database migrations (additive only)
  - Helper functions with no callers yet
  - Test stubs with `.skip` markers
  - Feature flag enum additions (flag not yet checked)

  **Middle Patches** (gated behavior):
  - Business logic behind feature flags
  - New endpoints/procedures (gated or unused)
  - Test implementations for gated code

  **Late Patches** (observable changes):
  - Wire up UI/API to new logic
  - Enable feature flag for users
  - Remove old code paths
  - Cleanup and deprecations

- Current State Analysis
  What's the current state of the codebase relative to where we want it to be.

- Required Changes
    Be specific. Cite files with approximate line numbers, and name functions. When creating a new function or updating an existing one's signature, explicitly state the signature using a typescript codeblock, like so:
    ```ts
        const someFunction = (myArgs: { firstArg: Subscription.Record, secondArg: Date | number }): Promise<Subscription.Item | null>
    ```

- Acceptance Criteria
    Make this a bullet point list of what needs to be in place to consider the gameplan completed.

- Open Questions
    What questions should be decided as a team about what we're going to do?

- Explicit Opinions
    Explicitly state the technical design decisions you've arrived at (in conversation with the person you're building the gameplan for).
    That way those decisions themselves can be subject to review. When a decision has been arrived at, include the rationale for why. E.g:
    "Re-use existing `cancelSubscription` logic rather than create new one. That way we can keep one authoritative implementation of all of the side effects rather than have to maintain them in multiple places"
    "Explicitly assume we are not going to make any changes to billing state when updating pricing models. That's the least change to existing behavior (this gameplan only attempts to make the web app behavior available via CLI). And that's the least change to existing data / sidesteps the question of how to handle breaking schema changes on existing subscriptions."

- Patch Classification
    Each patch heading should include a classification marker:
    - `[INFRA]` - No observable behavior change. Types, schemas, helpers, migrations, test stubs, feature flag additions. Safe to merge anytime.
    - `[GATED]` - New behavior behind a feature flag. Observable behavior unchanged until flag is enabled. Can merge before flag activation.
    - `[BEHAVIOR]` - Changes observable behavior. Requires careful review. Should be as small as possible.

    Format: `### Patch N [CLASSIFICATION]: Description`

    **Goal**: Maximize `[INFRA]` and `[GATED]` patches. Minimize `[BEHAVIOR]` patches. This lets most code ship early and concentrates review effort on the patches that actually change behavior.

- Patches
    Make this an ordered list of patches like: "Patch 1 [CLASSIFICATION]: .....".
    Each patch should include a specific list of files to modify / create / delete, and what specific changes to make.

    ### Test Types

    Choose the appropriate test type based on what you're testing:

    **Unit Tests** (`*.unit.test.ts`) - Pure functions, validation logic, isolated business rules. No database access.

    **DB-Backed Tests** (`*.db.test.ts`) - Table methods, services with database access, business logic requiring real data.

    **Behavior Tests** (`*.behavior.test.ts`) - Use when an invariant must hold across multiple configurations. The behavior test framework (`src/test/behaviorTest/`) runs tests against the cartesian product of dependency implementations.

    Use behavior tests when:
    - The same invariant must hold across contract types (MoR vs Platform)
    - Behavior varies by country, customer residency, or discount type
    - You'd otherwise write `if (config === X) { expect... } else { expect... }`

    Example: "MoR checkouts always create fee calculations" is tested across all country × residency × discount combinations, asserting the invariant holds universally.

    If your gameplan introduces behavior that varies by configuration, document which invariants need behavior tests:
    ```
    Behavior Test: checkout flow
    Dependencies: ContractTypeDep, CustomerResidencyDep, DiscountDep
    Invariants:
    - MoR: feeCalculation is created
    - Platform: feeCalculation is null
    ```

    ### Test-First Pattern

    Write test stubs with `.skip` markers BEFORE implementation. This:
    - Documents expected behavior upfront (reviewable without implementation)
    - Creates an `[INFRA]` patch that can ship early
    - Makes test removal impossible to forget (`.skip` shows in test output)

    **Test stub patches** (`[INFRA]`):
    - Add tests with `.skip` marker
    - Include `// PENDING: Patch N` comment indicating which patch implements it
    - Document setup and expectations in comments

    **Test implementation patches** (`[GATED]` or `[BEHAVIOR]`):
    - Remove `.skip` marker and `// PENDING: Patch N` comment
    - Implement the test body
    - Should be in the SAME patch as the code being tested

    Example test stub (for an `[INFRA]` patch):
    ```ts
    describe('adjustSubscription', async () => {
        it.skip('should fail if the subscription is in a terminal state', async () => {
            // PENDING: Patch 4
            // setup: get a subscription into a terminal state
            // expectation: throw error with message "Cannot adjust terminated subscription"
        })

        it.skip('should fail for free plan subscriptions', async () => {
            // PENDING: Patch 4
            // setup: create a free plan subscription
            // expectation: throw error with message "Cannot adjust free plan"
        })

        it.skip('should execute successfully for an active, paid subscription', async () => {
            // PENDING: Patch 5
            // setup: create non-free plan subscription
            // expectations:
            // - creates billing run
            // - billing run is executed
            // - payment is created and successfully received
            // - old subscription items are expired
            // - new subscription items are created based on what was provided
        })
    })
    ```

    Example implementation (in Patch 4, an `[GATED]` or `[BEHAVIOR]` patch):
    ```ts
    it('should fail if the subscription is in a terminal state', async () => {
        // setup
        const subscription = await createTerminatedSubscription()

        // act & assert
        await expect(adjustSubscription(subscription.id, {...}))
            .rejects.toThrow('Cannot adjust terminated subscription')
    })
    ```

    ### Test Map

    Include a test map that tracks stub → implementation relationships. This enables the fan-gameplan tooling to tell each coding agent exactly which tests to unskip.

    Format:
    ```
    | Test Name | File | Stub Patch | Impl Patch |
    |-----------|------|------------|------------|
    | adjustSubscription > should fail if subscription is in terminal state | src/subscriptions/adjust.test.ts | 2 | 4 |
    | adjustSubscription > should fail for free plan subscriptions | src/subscriptions/adjust.test.ts | 2 | 4 |
    | adjustSubscription > should execute successfully for active paid subscription | src/subscriptions/adjust.test.ts | 2 | 5 |
    ```

    **Test Name**: Use the full describe/it path (e.g., `describe > it` or `describe > describe > it`)
    **Stub Patch**: The `[INFRA]` patch that introduces the `.skip` test
    **Impl Patch**: The patch that implements the code AND unskips the test

    When writing patch descriptions, reference this map:
    - Stub patches: "Introduces test stubs: [list test names from map where Stub Patch = N]"
    - Implementation patches: "Unskips and implements: [list test names from map where Impl Patch = N]"

- Dependency Graph
    Express patch dependencies in this exact format, including classification:
    ```
    - Patch 1 [INFRA] -> []
    - Patch 2 [INFRA] -> [1]
    - Patch 3 [GATED] -> [1]
    - Patch 4 [BEHAVIOR] -> [2, 3]
    ```
    Where `[]` means no dependencies, and `[1, 2]` means depends on patches 1 and 2.

    This format enables automated tooling to fan out parallel patch execution.

    **Mergability Insight**: Include a note like "X of Y patches are `[INFRA]`/`[GATED]` and can ship without changing observable behavior."

- Mergability Checklist
    Before finalizing the gameplan, verify:
    - [ ] Feature flag strategy documented (or explained why not needed)
    - [ ] Early patches contain only non-functional changes (`[INFRA]`)
    - [ ] Test stubs with `.skip` markers are in early `[INFRA]` patches
    - [ ] Test implementations are co-located with the code they test (same patch)
    - [ ] Test Map is complete: every test has Stub Patch and Impl Patch assigned
    - [ ] Test Map Impl Patch matches the patch that implements the tested code
    - [ ] `[BEHAVIOR]` patches are as small as possible
    - [ ] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patches late
    - [ ] Each `[BEHAVIOR]` patch is clearly justified (cannot be gated or deferred)


# Notes
- Be explicit rather than wishy washy. It should be easy to pick up the markdown and execute its instructions patch-by-patch using a coding agent that has none of your context window, but just has access to the codebase
- If there are new functions or functions whose signatures will be modified, always include the proposed function signatures. This helps the team build explicit understanding of what we're going to do
- Don't make it overly verbose. The gameplan should be 10x easier for a human to review and provide pointed feedback about than the code that gets produced as a result
- **Workstream gameplans**: If part of a workstream, ensure the gameplan's acceptance criteria align with the milestone's "Definition of Done". The gameplan must leave the codebase in a consistent, functional state - even if the overall workstream is incomplete.

# Recording in Notion

When the gameplan is approved, create an entry in the Gameplans database:
- **Gameplan**: The project name
- **Status**: "Ready to Execute"
- **Workstream**: Link to the workstream (if applicable)
- **Markdown**: Attach the gameplan markdown file