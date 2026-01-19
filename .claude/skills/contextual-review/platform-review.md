# Platform (flowglad-next) Review Guidelines

Review guidelines for changes to `platform/flowglad-next/`, the main Flowglad application.

## Directory Structure

```
platform/flowglad-next/src/
├── app/                # Next.js App Router pages and API routes
├── components/         # React components
├── db/                 # Database layer
│   └── schema/         # Drizzle ORM schema definitions
├── server/             # Server-side business logic
├── utils/              # Utility functions
├── subscriptions/      # Subscription management logic
├── trigger/            # Trigger.dev background jobs
├── hooks/              # React hooks
├── contexts/           # React contexts
├── lib/                # Library integrations
├── email-templates/    # Email template components
├── pdf-generation/     # PDF generation utilities
├── api-contract/       # API contract definitions
├── test/               # Test utilities and helpers
└── types.ts            # Global type definitions
```

## Review Checklist

### API Routes (`app/api/`)
- [ ] Authentication/authorization checks present
- [ ] Input validation using Zod schemas
- [ ] Proper error handling with appropriate status codes
- [ ] Rate limiting considered for public endpoints
- [ ] No sensitive data in responses

### Database Operations
- [ ] Transactions used for multi-table operations
- [ ] RLS policies respected
- [ ] Indexes exist for query patterns
- [ ] No N+1 query patterns
- [ ] Proper error handling for constraint violations
- [ ] No raw Drizzle calls in business logic (use tableMethods instead)

### Table Methods (`db/tableMethods/`)
- [ ] All inputs validated with Zod schemas
- [ ] All outputs validated with Zod schemas
- [ ] Validation applied even for "obvious" types (see rationale below)
- [ ] No redundant methods (e.g., `selectFooById` when `selectFoos` suffices)

### Business Logic (`server/`, `subscriptions/`)
- [ ] Edge cases handled
- [ ] State transitions are valid
- [ ] Audit logging where appropriate
- [ ] Billing calculations are precise (no floating point errors)
- [ ] Currency handling is consistent

### Background Jobs (`trigger/`)
- [ ] Jobs are idempotent
- [ ] Proper error handling and retries
- [ ] Timeouts configured appropriately
- [ ] Dead letter handling for failed jobs
- [ ] Idempotency keys are deterministic (resource-based, not timestamp-based)
- [ ] Uses `testSafeTriggerInvoker()` wrapper for test compatibility

### Components (`components/`)
- [ ] Client vs Server component usage is correct
- [ ] Loading and error states handled
- [ ] Accessibility considerations (aria labels, keyboard nav)
- [ ] No hardcoded text (use i18n if applicable)

## Testing Requirements

### Test Guidelines (from CLAUDE.md)
- No mocking except for network calls
- No `.spyOn` or dynamic imports
- No `any` types in tests
- Each `it` block should be specific and exhaustive
- Use detailed assertions, not `toBeDefined`

### Test Types
- **Unit tests**: Pure functions, utilities, business logic
- **Integration tests**: Database operations, API endpoints
- **Behavior tests**: Cross-implementation invariants (see `src/test/behaviorTest/`)

### RLS Tests
Schema files may have corresponding `.rls.test.ts` files testing row-level security policies.

## Security Considerations

### Authentication
- Better Auth integration for user sessions
- API key authentication for programmatic access
- Organization/membership boundaries

### Authorization
- Multi-tenant isolation via RLS
- Role-based access within organizations
- Resource ownership verification

### Data Protection
- Sensitive fields encrypted/hashed where appropriate
- PII handling compliant
- Audit logging for sensitive operations

## Integration Points

### External Services
- **Stripe**: Payment processing
- **Trigger.dev**: Background job execution
- **Email**: Transactional email sending
- **OpenTelemetry**: Observability

### Internal Systems
- **OpenAPI spec**: Generated from API routes
- **SDKs**: Packages consume the API
- **Documentation**: Describes the API and behaviors

## Performance Considerations

- [ ] Database queries are optimized
- [ ] Pagination for list endpoints
- [ ] Caching where appropriate
- [ ] Heavy operations offloaded to background jobs
- [ ] Bundle size impact for client components

## Common Patterns

### Error Handling
Use typed errors with `better-result` patterns. Functions return `Result<T, Error>`:
- `Result.ok(value)` for success
- `Result.err(error)` for failures

### Validation
Zod schemas for all external input.

### Database Access
**Never use raw Drizzle calls in business logic.** All database access in `server/`, `subscriptions/`, `trigger/`, and other business logic should go through `db/tableMethods/` methods.

Raw Drizzle calls are only acceptable inside `db/tableMethods/` itself. This ensures:
- Consistent validation at the data access boundary
- Centralized query logic that's easier to audit and optimize
- Clear separation between business logic and data access

```typescript
// WRONG - raw Drizzle in business logic
const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) })

// CORRECT - use tableMethods
const customer = await selectCustomerById({ customerId: id })
```

### Table Methods Zod Validation
**All methods in `db/tableMethods/` must have Zod validation for both inputs and outputs.**

This ensures full unity between runtime behavior and the type system. Apply validation even when it seems redundant or "silly" — the goal is consistency and runtime safety, not minimal code.

**Why this matters:**
- TypeScript types are erased at runtime; Zod provides runtime guarantees
- Database queries can return unexpected shapes (nulls, missing fields, wrong types from raw SQL)
- Drizzle's type inference isn't always accurate, especially with complex joins or raw queries
- Consistent validation catches bugs at the boundary, not deep in business logic
- Makes refactoring safer — schema changes surface immediately as validation errors

**Pattern:**
```typescript
// Input validation - even for simple queries
const getCustomerByIdInputSchema = z.object({
  customerId: z.string().uuid(),
})

// Output validation - even when Drizzle provides types
const customerOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  // ... all fields explicitly validated
})

export const getCustomerById = async (input: unknown) => {
  const { customerId } = getCustomerByIdInputSchema.parse(input)
  const result = await db.query.customers.findFirst({ where: eq(customers.id, customerId) })
  return customerOutputSchema.parse(result)
}
```

**Review guidance:**
- Reject PRs that add table methods without Zod validation
- "The types are already correct" is not a valid reason to skip validation
- Output validation is just as important as input validation

### Avoiding Redundant Table Methods
**Do not create new table methods when existing ones suffice.**

The most common violation is creating `selectFooById` or `selectFooByBar` methods when a general `selectFoos` method with filtering already exists.

```typescript
// WRONG - creating a redundant method (even with proper Zod validation)
const selectCustomerByEmailInputSchema = z.object({
  email: z.string().email(),
})

export const selectCustomerByEmail = async (input: unknown) => {
  const { email } = selectCustomerByEmailInputSchema.parse(input)
  const result = await db.query.customers.findFirst({ where: eq(customers.email, email) })
  return selectCustomerSchema.parse(result)
}
// This method is redundant because selectCustomers already supports email filtering

// CORRECT - use the existing selectCustomers with a filter
const customer = await selectCustomers({ filters: { email } })
```

**When a new method IS appropriate:**
- Complex joins or aggregations that don't fit the existing method's pattern
- Performance-critical paths that need specialized queries
- Queries that return a fundamentally different shape than the general method

**Review guidance:**
- Before approving a new `selectFooByX` method, check if `selectFoos` already supports that filter
- Ask: "Could this be a parameter on an existing method instead?"

### State Management
React contexts for client state, server state via React Query patterns.

## Transaction Patterns

### TransactionEffectsContext
Functions receiving this context have four methods:

| Method | Purpose | When Processed |
|--------|---------|----------------|
| `transaction` | Drizzle transaction object | During execution |
| `emitEvent(event)` | Queue event for insertion | Before commit |
| `enqueueLedgerCommand(cmd)` | Queue ledger operation | Before commit |
| `invalidateCache(key)` | Queue cache key for invalidation | After commit |

### Effects Processing Order (Critical)
The order of effect processing is **critical** for correctness:

1. **Before commit (inside transaction)**: Events inserted, ledger commands processed
2. **After commit (outside transaction)**: Cache invalidation (fire-and-forget)

```typescript
// In comprehensiveAuthenticatedTransaction:
// 1. Execute business logic, accumulate effects
// 2. Process events and ledger commands (BEFORE commit)
// 3. Commit transaction
// 4. Invalidate cache (AFTER commit, fire-and-forget)
```

**Why this matters**: Reversing the order causes stale cache reads. If cache is invalidated before commit, a concurrent request could re-populate cache with stale data before the transaction commits.

### Transaction Wrappers

| Wrapper | Returns | Use Case |
|---------|---------|----------|
| `authenticatedTransaction` | `Result.ok(value)` | Basic authenticated transaction |
| `authenticatedProcedureTransaction` | `Result.ok(value)` | TRPC procedures |
| `comprehensiveAuthenticatedTransaction` | Expects `Result<T, Error>` | Full effects: cache, events, ledger |

**Important**: Comprehensive transactions expect the function to return `Result.ok(value)`, not the value directly.

## Caching Patterns

### Fail-Open Pattern
The codebase uses a "fail-open" pattern for Redis:
- Redis errors become cache misses, **never** request failures
- Don't add error handling that throws on cache failures
- Cache reads validate against Zod schemas

### CacheDependency Keys
Predefined dependency keys for cache invalidation:

```typescript
CacheDependency.customerSubscriptions(customerId)
CacheDependency.subscriptionItems(subscriptionId)
CacheDependency.subscriptionItemFeatures(subscriptionItemId)
CacheDependency.subscriptionLedger(subscriptionId)
```

### Cached Combinator
The `cached()` combinator adds caching with schema validation:

```typescript
const getCachedData = cached(
  fetchData,
  { ttl: 3600, dependencies: [CacheDependency.customerSubscriptions(id)] },
  dataSchema
)
```

## Subscription & Billing Patterns

### adjustSubscription Complexity
This is one of the most complex functions in the codebase. Key gotchas:

**Terse Items**
- Can pass just `{ priceSlug, quantity }` instead of full subscription items
- These get expanded using price data from the pricing model

**Price Slug Resolution**
- Slugs are scoped to the pricing model, not globally unique
- Resolution order: try as slug first (scoped to pricing model), then as UUID

**Manual Item Filtering**
- `isNonManualSubscriptionItem()` filter is critical
- Manually-created items are filtered out before pricing calculations
- Forgetting this filter causes incorrect totals

**Timing Constraints**
- End-of-period adjustments are **only** allowed for downgrades (`netCharge <= 0`)
- Upgrades with charges must apply immediately
- Validation happens before any modification

**Payment Method Requirement**
- If proration charge > 0, requires a default or backup payment method
- Without this, billing run cannot execute

**Cache Invalidation Timing**
- For billing run flows, cache invalidation happens in `processOutcomeForBillingRun`
- Not in `adjustSubscription` itself
- Reviewers should trace where invalidation actually occurs

### Proration Calculation
```
fairValue = (oldPlanAmount × percentThroughPeriod) + (newPlanAmount × percentRemaining)
netCharge = fairValue - existingPayments
```

Rules:
- Includes payments with status `Processing` OR `Succeeded` (not `Failed`)
- Caps at 0 — never issues credits/refunds for downgrades
- Uses precise decimal math (no floating point)

## Trigger.dev Patterns

### Idempotency Keys
Must be deterministic based on resource IDs:

```typescript
// CORRECT - deterministic based on resource
createTriggerIdempotencyKey(`send-notification-${organizationId}`)

// WRONG - non-deterministic breaks idempotency
createTriggerIdempotencyKey(`send-notification-${Date.now()}`)
```

### Test-Safe Invocation
Use `testSafeTriggerInvoker()` wrapper for tasks that should behave differently in test environments.

### Idempotent Notification Pattern
```typescript
export const idempotentSendNotification = async (params) => {
  return testSafeTriggerInvoker(sendNotificationTask, {
    ...params,
    idempotencyKey: createTriggerIdempotencyKey(`notification-${params.resourceId}`)
  })
}
```

## Event & Webhook Patterns

### Event Emission
- Events created via `emitEvent()` in transaction context
- Bulk-inserted via `bulkInsertOrDoNothingEventsByHash()` before commit
- **Hash-based deduplication**: Same payload = same hash = no duplicate

Event payloads must be deterministic for deduplication to work correctly.

### Ledger Commands
Commands are discriminated unions processed before commit:

| Command Type | Purpose |
|--------------|---------|
| `UsageEventProcessed` | Record usage consumption |
| `CreditGrantRecognized` | Apply credit grants |
| `BillingPeriodTransition` | Period boundary accounting |
| `AdminCreditAdjusted` | Manual credit adjustments |

Each creates `LedgerEntry` records with `Direction` (Debit/Credit) for accounting.

## Tracing Patterns

### Basic Tracing
```typescript
const result = await traced(myFunction, { name: 'operation-name' })(args)
```

### Checkpoint Pattern
For business logic that needs to set span attributes without importing OpenTelemetry:

```typescript
const result = await tracedWithCheckpoints(async (checkpoint) => {
  // ... do work ...
  checkpoint({ 'business.metric': computedValue })
  // ... more work ...
  return value
}, { name: 'complex-operation' })
```

### Domain-Specific Factories
Pre-configured for external services:
- `r2Traced` - R2 storage operations
- `resendTraced` - Email sending
- `stripeTraced` - Stripe API calls
- `svixTraced` - Webhook delivery

## RLS Enforcement Details

### Role Setting
- Role set via SQL: `SET LOCAL ROLE ${role}`
- Role name comes from JWT claims, not user object
- Roles: `merchant`, `customer`, `admin`

### Customer Role Requirements
Customer role requires **both** claims:
- `organizationId` - which org's data to access
- `customerId` - which customer's data to access

### Testing RLS
Use `authenticatedCustomerTransaction` helper to simulate customer-role access in tests.

## Patterns Easily Overlooked

### 1. Transaction Effects Order
Cache invalidation MUST happen after commit. Verify this when reviewing transaction code.

### 2. adjustSubscription Cache Timing
Cache invalidation for billing run flows happens in `processOutcomeForBillingRun`, not in the initial `adjustSubscription` call.

### 3. Manual Subscription Items
Always filter with `isNonManualSubscriptionItem()` before pricing calculations.

### 4. Event Payload Determinism
Event payloads must be deterministic for hash-based deduplication to work.

### 5. Trigger Idempotency Keys
Must be resource-based, never timestamp-based.

### 6. Proration Includes Processing Payments
Both `Processing` and `Succeeded` statuses count toward existing payments in proration.

### 7. End-of-Period Adjustments
Only allowed for downgrades (netCharge <= 0). Upgrades must apply immediately.

### 8. Table Methods Must Have Zod Validation
All methods in `db/tableMethods/` require Zod validation for inputs AND outputs, even when it seems unnecessary. This ensures runtime/type system unity. "The types already cover this" is not an acceptable justification for skipping validation.

### 9. No Raw Drizzle in Business Logic
Business logic (`server/`, `subscriptions/`, `trigger/`) must never contain raw Drizzle calls. Always go through `db/tableMethods/`. Raw Drizzle is only acceptable inside tableMethods itself.

### 10. Avoid Redundant Table Methods
Before creating `selectFooById` or `selectFooByBar`, check if `selectFoos` already supports that query pattern. Prefer adding parameters to existing methods over creating specialized variants.
