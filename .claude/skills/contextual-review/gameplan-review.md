# Gameplan Review Guidelines

Review guidelines for implementation gameplans and technical plans before execution begins.

## Purpose

Gameplans are implementation blueprints that agents will execute. A thorough review prevents wasted effort, ensures completeness, and catches architectural issues before code is written.

## Review Checklist

### 1. Adjacent Concepts Analysis

Check if the gameplan considers ripple effects on related systems:

**Data Model Changes**
- [ ] **setupPricingModel impact**: If schema changes, will `setupPricingModel` need updates? Is this addressed?
- [ ] **SDK impact**: Are both `FlowgladServer` methods and `FlowgladProvider` hooks considered?
- [ ] **adjustSubscription coverage**: Have all `adjustSubscription` scenarios been enumerated?
- [ ] **better-auth plugin**: If new `FlowgladServer` methods or action keys are needed, is there a plan for better-auth plugin integration?

**Questions to ask:**
- What existing flows touch this data?
- What SDK methods expose this data to customers?
- What webhooks or events might need updates?

### 2. Test Coverage Quality

Look for test coverage that is tautological or provides no value:

**Red flags:**
- Tests that just assert a function returns what it was passed
- Tests that duplicate validation already enforced by types
- Tests that mock so heavily they test nothing real
- "Coverage for coverage's sake" without meaningful assertions

**Example of a tautological test:**
```typescript
// BAD: Tests nothing meaningful
it('should return the customer', async () => {
  const customer = await createCustomer(input)
  expect(customer).toBeDefined()  // Tautological - of course it's defined
})

// GOOD: Tests actual business logic
it('should set customer currency based on organization default when not provided', async () => {
  const customer = await createCustomer({ ...input, currency: undefined })
  expect(customer.currency).toBe(organization.defaultCurrency)
})
```

### 3. Behavior Test Requirements

For features with complex state transitions or many possible states, check for behavior test planning.

**When behavior tests are needed:**
- User flows with multiple valid configurations (countries, contract types, billing intervals)
- State machines with multiple transitions (subscription lifecycle, payment processing)
- Business logic that must hold invariants across all variants

**Reference:** See `platform/flowglad-next/src/prompts/behavior-test.md` for the behavior test framework.

**Questions to ask:**
- What are the dependency axes (configurations that could vary)?
- What invariants must hold universally?
- What invariants are conditional on specific variants?
- Should this use filtered behavior tests or integration tests?

### 4. Test Coverage Gaps

Identify missing test coverage:

- [ ] **Happy path**: Basic success scenarios
- [ ] **Error paths**: Invalid inputs, constraint violations, authorization failures
- [ ] **Edge cases**: Null values, empty arrays, boundary conditions
- [ ] **State transitions**: All valid transitions and invalid transition rejections
- [ ] **Concurrency**: Race conditions, idempotency
- [ ] **RLS policies**: Multi-tenant isolation verification

### 5. New Table Enumeration

For gameplans adding database tables, verify completeness:

**Required specifications:**
- [ ] **Data isolation strategy**: RLS policies, triggers, or application-level checks?
- [ ] **Merchant RLS policies**: What can organizations read/write on their own data?
- [ ] **Customer RLS policies**: What can customers read on their own data?
- [ ] **Column refinements**: Which columns need Zod refinements in `buildSchemas`?
  - Enums requiring `core.createSafeZodEnum`
  - JSON columns requiring custom schemas
  - Computed or derived fields
- [ ] **Hidden/read-only/create-only classification**: Which columns go in which category?
- [ ] **Foreign key indexes**: Are indexes planned for all FK columns?
- [ ] **ID prefix**: What prefix will `tableBase` use?

**Reference:** See `api-review.md` for schema patterns.

### 6. Antipattern Detection

Flag proposed patterns that create technical debt or hide errors:

| Antipattern | Problem | Better Approach |
|-------------|---------|-----------------|
| Catch-all try/catch that swallows errors | Errors disappear silently | Use typed error handling, let unexpected errors propagate |
| `any` types to "make it work" | Loses type safety | Define proper types, use generics |
| Polling instead of webhooks/events | Wastes resources, delays | Use event-driven patterns |
| Storing derived data without sync strategy | Data gets stale | Compute on read or use reliable sync |
| Optional chaining chains (`a?.b?.c?.d`) | Hides missing data bugs | Validate at boundaries, fail fast |
| Hardcoded magic values | Unclear meaning, hard to change | Use constants or configuration |
| N+1 query patterns | Performance degrades with scale | Batch queries, use joins |

### 7. Agent-Readiness Analysis

Evaluate the gameplan's clarity for agent execution:

**Clarity checks:**
- [ ] **Unambiguous steps**: Can each step be executed without interpretation?
- [ ] **File paths specified**: Are target files clearly identified?
- [ ] **Dependencies explicit**: Is the order of operations clear?
- [ ] **Success criteria defined**: How does the agent know when a step is complete?
- [ ] **Edge cases documented**: Are special cases called out?

**Context gaps to fill:**
- Does the agent need to know about existing patterns to follow?
- Are there implicit assumptions about codebase structure?
- Are there related files the agent should read first?
- Are there gotchas or non-obvious constraints?

**Ambiguity examples:**
```markdown
# AMBIGUOUS
- Add validation to the checkout flow

# CLEAR
- Add Zod validation to `createCheckoutSession` in `src/server/routers/checkoutSessionsRouter.ts`
- Validate that `priceId` exists and belongs to the organization
- Return 400 with message "Price not found" if validation fails
```

## Review Output Format

Structure your review as:

```markdown
## Gameplan Review: [Feature Name]

### Adjacent Concepts
- [List any missing considerations or confirm coverage is adequate]

### Test Coverage Assessment
- **Unnecessary tests identified**: [List or "None"]
- **Missing coverage**: [List gaps]
- **Behavior tests needed**: [Yes/No, with justification]

### New Tables (if applicable)
- [List any missing specifications]

### Antipatterns
- [List concerns or "None identified"]

### Agent-Readiness
- **Clarity**: [Good/Needs improvement]
- **Suggested context to add**: [List or "None"]
- **Ambiguous sections**: [List or "None"]

### Recommendation
[Approve / Request Changes / Comment]

[If requesting changes, list specific items to address]
```

## Important Notes

- **Not all gameplans need changes.** Your job is to identify issues if they exist, not to find problems where there are none.
- **Focus on high-impact issues.** Minor style preferences are less important than architectural gaps.
- **Consider the agent executor.** The gameplan will be executed by an agent with limited context. Clarity matters.
