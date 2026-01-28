# Base Review Guidelines

Read this document first before any area-specific guide. It establishes the reviewer mindset and quality calibration for this codebase.

## Reviewer Philosophy

This codebase has established patterns we're proud of. The reviewer's job is **not** to find novel improvements or suggest alternative architectures, but to ensure changes:

1. **Follow existing conventions** - Match how similar code is written elsewhere
2. **Don't introduce regressions** - Preserve invariants the codebase maintains
3. **Maintain type/runtime safety guarantees** - Zod validation, Result types, typed errors
4. **Handle edge cases the codebase handles elsewhere** - Check similar code for patterns

**Flag departures from conventions as issues.** Novel patterns need strong justification - the burden of proof is on the change, not on the existing pattern.

## Before Reviewing

### 1. Identify the Change Type

| Change Type | Primary Guide | Key Concerns |
|-------------|---------------|--------------|
| Schema (`src/db/schema/`) | api-review.md | buildSchemas, RLS, indexes, type refinements |
| Business logic (`server/`, `subscriptions/`) | platform-review.md | Transactions, cache invalidation, tableMethods |
| API routes (`app/api/`, routers) | platform-review.md + api-review.md | Auth, validation, Result pattern |
| Background jobs (`trigger/`) | platform-review.md | Idempotency, test-safe invocation |
| SDK packages (`packages/`) | packages-review.md | Exports, types, cross-package impact |
| Documentation (`platform/docs/`) | docs-review.md | Accuracy, navigation, SDK alignment |
| Example apps (`playground/`) | playground-review.md | Working examples, correct SDK usage |
| Implementation plans | gameplan-review.md | Completeness, adjacent impacts, test coverage |

### 2. Find Similar Existing Code

Before flagging style issues, search for similar code in the codebase. The existing pattern is the standard. If the PR matches existing code, it's correct even if you'd personally do it differently.

## Core Quality Standards

### Type Safety (Critical)

**Zod Validation Everywhere**
- tableMethods must validate inputs AND outputs
- "The types already cover this" is NOT valid justification for skipping validation
- Enum columns need `core.createSafeZodEnum` refinements in `buildSchemas`

**Result Pattern**
```typescript
// Correct - use Result.await() for async
const value = yield* Result.await(someAsyncResultFunction())

// Correct - use static methods
if (Result.isOk(result)) { ... }
if (Result.isError(result)) { ... }

// Wrong - instance methods don't exist
if (result.isOk()) { ... }
```

**Typed Errors**
- Use error classes from `@/errors` (ValidationError, NotFoundError, ConflictError)
- Return `Result.err(new SomeError(...))`, not generic Error objects

### Transaction Integrity (Critical)

**Effect Ordering**
```
1. Execute business logic, accumulate effects
2. Process events and ledger commands (BEFORE commit)
3. Commit transaction
4. Invalidate cache (AFTER commit, fire-and-forget)
```

Reversing steps 3 and 4 causes stale cache bugs. This is a critical issue.

**Comprehensive Transactions Return Result**
```typescript
// Correct
return Result.ok({ customer: createdCustomer })

// Wrong - comprehensive transactions expect Result
return { customer: createdCustomer }
```

### Data Access (High)

**No Raw Drizzle in Business Logic**
```typescript
// Wrong - raw Drizzle in server/subscriptions/trigger code
const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) })

// Correct - use tableMethods
const customer = await selectCustomerById({ customerId: id })
```

Raw Drizzle is only acceptable inside `db/tableMethods/` itself.

**No Redundant tableMethods**
Before approving a new `selectFooById` or `selectFooByBar`, check if `selectFoos` already supports that filter. Prefer adding parameters to existing methods over creating specialized variants.

### Cache Invalidation (High)

**Every mutation needs cache invalidation review.** Ask: "What cached data does this change affect?"

| Operation | Required Invalidation |
|-----------|----------------------|
| Insert | Set membership for parent collection |
| Update | Content for the updated item |
| Delete | Both set membership AND content |
| Move (change parent) | Set membership for BOTH old and new parent, plus content |

Use `CacheDependency.*` keys. Missing invalidation causes stale data bugs that are hard to reproduce.

### Testing (Medium)

Per CLAUDE.md testing guidelines:
- No mocking except for network calls
- No `.spyOn` or dynamic imports
- No `any` types in tests
- No `toBeDefined` - use specific value assertions
- Each `it` describes one scenario with exhaustive assertions
- Specific outcome statements, not "should handle X correctly"

## Severity Calibration

### Critical
Issues that cause security vulnerabilities, data corruption, or silent failures:
- RLS policy bypass or missing organization boundary checks
- Cache invalidation before commit (race condition)
- Missing Zod validation on API boundaries
- SQL injection or other OWASP vulnerabilities
- Breaking changes to published SDK without versioning

### High
Issues that cause bugs, performance problems, or maintenance burden:
- Raw Drizzle calls in business logic
- Missing cache invalidation on mutations
- N+1 query patterns
- Transaction effects in wrong order
- Missing error handling for expected failure modes
- Idempotency keys using timestamps instead of resource IDs

### Medium
Issues that reduce code quality or deviate from conventions:
- Redundant tableMethods when existing method suffices
- Non-idempotent Trigger.dev jobs
- `any` types in non-API code without justification
- Tests that only assert `toBeDefined`
- Missing Zod validation on internal tableMethods

### Low
Style issues and minor improvements:
- Inconsistent naming within a PR
- Missing JSDoc on internal functions
- Suboptimal but correct logic
- Minor code organization suggestions

## Common Blind Spots

Issues that reviewers unfamiliar with this codebase commonly miss:

### 1. buildSchemas Auto-Restrictions
`buildSchemas` automatically:
- Makes `livemode` and `organizationId` read-only
- Omits `id`, `createdAt`, `updatedAt`, `position`, `createdByCommit`, `updatedByCommit` from insert schemas

**Don't manually add these restrictions** - it's redundant and confusing.

### 2. Discriminated Unions Need Per-Variant Schemas
Adding a new variant to a discriminated union? You need:
- A separate `buildSchemas` call with the discriminator value in the refinement
- Then combine variants into `z.discriminatedUnion`

A single `buildSchemas` call cannot produce a discriminated union.

### 3. adjustSubscription Complexity
When reviewing subscription adjustment logic:
- Always check for `isNonManualSubscriptionItem()` filtering before pricing calculations
- End-of-period adjustments only allowed for downgrades (netCharge <= 0)
- Cache invalidation for billing run flows happens in `processOutcomeForBillingRun`, not in `adjustSubscription`

### 4. Event Payload Determinism
Events use hash-based deduplication. Same payload = same hash = no duplicate. If event payloads include non-deterministic values (timestamps, random IDs), deduplication breaks.

### 5. Trigger.dev Idempotency Keys
```typescript
// Correct - deterministic based on resource
createTriggerIdempotencyKey(`send-notification-${organizationId}`)

// Wrong - non-deterministic breaks idempotency
createTriggerIdempotencyKey(`send-notification-${Date.now()}`)
```

### 6. Proration Includes Processing Payments
Both `Processing` AND `Succeeded` payment statuses count toward existing payments in proration calculations. Don't filter to only `Succeeded`.

### 7. Foreign Key Indexes for RLS Performance
When adding foreign keys, always add an index. RLS policies use these columns and will be slow without indexes.

### 8. Namespace Type Declarations
Every schema should have a corresponding namespace with:
- `Record`, `Insert`, `Update` types
- `ClientRecord`, `ClientInsert`, `ClientUpdate` types
- `Where` type for select conditions
- `PaginatedList` if applicable
- All subtype variants for discriminated unions

### 9. Timestamps Are Epoch Milliseconds
All timestamps use epoch milliseconds via `timestamptzMs`. `buildSchemas` automatically adds `zodEpochMs` refinements. Don't manually add timestamp refinements or expect Date objects.

### 10. SDK Package Ripple Effects
Changes to `@flowglad/server` methods may require:
- Updates to `@flowglad/react` hooks
- Updates to the better-auth plugin
- Changes to `@flowglad/nextjs` integration

Check the package dependency graph in packages-review.md.

## Review Output Standards

Structure your review consistently:

1. **Summary**: One sentence describing what the change does
2. **Findings**: Grouped by severity (Critical, High, Medium, Low, Suggestions)
3. **Positive Notes**: Good patterns or improvements worth calling out
4. **Recommendation**: Approve, Request Changes, or Comment

Use `DiffComment` for inline feedback on specific lines. Use the summary for overall assessment.

When there are no significant issues, say so briefly. Not every review needs extensive commentary.
