# Data Model & API Review Guidelines

Review guidelines for changes to database schema and OpenAPI specifications.

## Key Directories

```
platform/flowglad-next/
├── src/db/schema/      # Drizzle ORM schema definitions
├── src/db/tableUtils.ts # Schema utilities (buildSchemas, RLS helpers, etc.)
├── src/db/createZodSchemas.ts # Zod schema generation
├── openapi.json        # Generated OpenAPI specification
└── src/api-contract/   # API contract definitions
```

## Database Schema Review

### Schema Files Location
All schema files are in `platform/flowglad-next/src/db/schema/`:
- Core entities: `customers.ts`, `products.ts`, `prices.ts`, `subscriptions.ts`
- Billing: `invoices.ts`, `payments.ts`, `billingPeriods.ts`, `billingRuns.ts`
- Usage: `usageEvents.ts`, `usageMeters.ts`, `usageCredits.ts`
- Access control: `features.ts`, `productFeatures.ts`, `subscriptionItemFeatures.ts`
- Infrastructure: `organizations.ts`, `memberships.ts`, `apiKeys.ts`, `webhooks.ts`

### Migration Rules
- **NEVER** manually create migration files
- Schema changes trigger migrations via `bun run migrations:generate`
- **NEVER** run `bun run migrations:push` - leave that to the user

### Schema Review Checklist
- [ ] Field types are appropriate (avoid overly permissive types)
- [ ] Required fields have `notNull()` constraint
- [ ] Default values are sensible
- [ ] Foreign keys have proper references with cascade behavior
- [ ] **Indexes added for all foreign key columns** (critical for RLS policy performance)
- [ ] Timestamps (`createdAt`, `updatedAt`) included where appropriate
- [ ] Enums use string literals, not numeric values
- [ ] No breaking changes to existing columns without migration plan

### Column Access Classification System

The codebase uses `buildSchemas` to control property access at three levels:

```typescript
const hiddenColumns = {
  externalId: true,
  stripeCustomerId: true,
  ...hiddenColumnsForClientSchema,  // position, createdByCommit, updatedByCommit
} as const

const readOnlyColumns = {
  livemode: true,        // Auto-added by buildSchemas
  organizationId: true,  // Auto-added by buildSchemas
  currency: true,
  pricingModelId: true,
} as const

const createOnlyColumns = {
  customerId: true,
  productId: true,
  doNotCharge: true,
} as const
```

| Access Level | In Select | In Insert | In Update | Use Case |
|--------------|-----------|-----------|-----------|----------|
| **Hidden** | No | No | No | Internal fields (`stripeCustomerId`, `externalId`, `position`) |
| **Read-only** | Yes | No | No | System-managed fields (`livemode`, `organizationId`) |
| **Create-only** | Yes | Yes | No | Immutable after creation (`customerId`, `pricingModelId`) |

**Important:** `buildSchemas` automatically adds `livemode` and `organizationId` as read-only, and omits `id`, `createdAt`, `updatedAt`, `position`, `createdByCommit`, `updatedByCommit` from insert schemas. Don't manually add these.

### Dual Schema System (Server vs Client)

Every entity must have both server and client schema variants:

```typescript
export const {
  insert: customersInsertSchema,        // Server-side (full access)
  select: customersSelectSchema,
  update: customersUpdateSchema,
  client: {
    select: customerClientSelectSchema, // API/Client-side (restricted)
    insert: customerClientInsertSchema,
    update: customerClientUpdateSchema,
  },
} = buildSchemas(customers, {
  refine: zodSchemaEnhancementColumns,
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'Customer',
})
```

### ID Prefix Convention

Each table uses `tableBase` with a unique ID prefix:

```typescript
...tableBase('cust'),   // Creates IDs like "cust_abc123"
...tableBase('price'),  // Creates IDs like "price_xyz789"
...tableBase('sub'),    // Creates IDs like "sub_def456"
```

### Type System Requirements

#### Enum Columns
Enum columns must have Zod overrides using `core.createSafeZodEnum` to ensure their types flow through properly rather than showing up as type `string`:
```typescript
// In column definition
status: pgEnumColumn({
  enumName: 'SubscriptionStatus',
  columnName: 'status',
  enumBase: SubscriptionStatus,
}).notNull()

// In refinement
const columnRefinements = {
  status: core.createSafeZodEnum(SubscriptionStatus),
}
```

#### Discriminated Unions
Discriminated union types require:
1. Separate `buildSchemas` calls for each variant
2. The discriminator value in the refinement
3. `.meta({ id: '....' })` for OpenAPI type names

```typescript
// Each variant needs its own buildSchemas call
export const {
  insert: subscriptionPriceInsertSchema,
  select: subscriptionPriceSelectSchema,
  // ...
} = buildSchemas(prices, {
  discriminator: 'type',
  refine: { type: z.literal(PriceType.Subscription), /* ... */ },
  // ...
})

// Then combine into discriminated union
export const pricesClientSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientSelectSchema,
    singlePaymentPriceClientSelectSchema,
    usagePriceClientSelectSchema,
  ])
  .meta({ id: 'PriceRecord' })
```

#### Namespace Type Declarations
Each schema should have a corresponding type declaration in the namespace, including:
- The main schema type (`Record`, `Insert`, `Update`)
- Client variants (`ClientRecord`, `ClientInsert`, `ClientUpdate`)
- All subtypes of each discriminated union
- `Where` type for select conditions
- `PaginatedList` type if applicable

```typescript
export namespace Customer {
  export type Insert = z.infer<typeof customersInsertSchema>
  export type Update = z.infer<typeof customersUpdateSchema>
  export type Record = z.infer<typeof customersSelectSchema>
  export type ClientInsert = z.infer<typeof customerClientInsertSchema>
  export type ClientUpdate = z.infer<typeof customerClientUpdateSchema>
  export type ClientRecord = z.infer<typeof customerClientSelectSchema>
  export type PaginatedList = z.infer<typeof customersPaginatedListSchema>
  export type Where = SelectConditions<typeof customers>
}
```

#### Timestamps as Epoch Milliseconds
All timestamps use epoch milliseconds via `timestamptzMs`. The `buildSchemas` function automatically adds `zodEpochMs` refinements for all timestamptz columns. Don't manually add timestamp refinements.

#### Field Visibility and Mutability Review
- [ ] **Hidden fields**: Internal implementation details (`stripeCustomerId`, `externalId`, `position`, `createdByCommit`, `updatedByCommit`)
- [ ] **Read-only fields**: System-managed fields clients shouldn't modify (`livemode`, `organizationId`, `currency`)
- [ ] **Create-only fields**: Immutable after creation (`customerId`, `productId`, `pricingModelId`, `doNotCharge`)

### RLS (Row-Level Security) and Indexes

Tables use `livemodePolicyTable` for RLS setup:

```typescript
livemodePolicyTable(TABLE_NAME, (table, livemodeIndex) => [
  // Always add indexes on foreign keys
  livemodeIndex([table.customerId]),  // Composite index with livemode
  constructIndex(TABLE_NAME, [table.priceId]),
  constructIndex(TABLE_NAME, [table.pricingModelId]),

  // Merchant policies for org-scoped access
  merchantPolicy('Enable all actions for own organizations', {
    as: 'permissive',
    to: 'merchant',
    for: 'all',
    using: orgIdEqualsCurrentSQL(),
  }),

  // Customer read policies
  enableCustomerReadPolicy(`Enable read for customers (${TABLE_NAME})`, {
    using: sql`"customer_id" in (select "id" from "customers")`,
  }),

  // Restrictive policies (e.g., prevent deletion)
  merchantPolicy('Disallow deletion', {
    as: 'restrictive',
    to: 'merchant',
    for: 'delete',
    using: sql`false`,
  }),
])
```

**Important:** Tables without direct `organizationId` (like `prices`) must scope access through parent FK relationships in their RLS policies.

RLS tests (`.rls.test.ts` files):
- Verify RLS policies align with business logic
- Check that multi-tenant isolation is maintained
- Ensure organization boundaries are respected

## Zod Schema Testing

### Test Coverage Requirements
- [ ] Zod schemas should have test coverage
- [ ] Schemas using `.refine()` **must** have tests covering the refinement logic
- [ ] Tests should cover both valid and invalid inputs
- [ ] Edge cases for refinements should be explicitly tested

## OpenAPI Specification Review

### File Location
- Generated spec: `platform/flowglad-next/openapi.json`
- Contract definitions: `platform/flowglad-next/src/api-contract/`

### OpenAPI Review Checklist
- [ ] Endpoint paths follow REST conventions
- [ ] HTTP methods are appropriate (GET, POST, PUT, PATCH, DELETE)
- [ ] Request/response schemas match actual implementation
- [ ] Required vs optional fields are correct
- [ ] Error responses documented (400, 401, 403, 404, 500)
- [ ] Authentication requirements specified
- [ ] Pagination parameters included for list endpoints
- [ ] Discriminated unions have proper `id` metadata for type names

### API Contract Files
Located in `src/api-contract/`:
- `checkoutSessionContract.ts`
- `customerContract.ts`
- `nodeClient.ts`
- `verify.ts`

## Breaking Changes

### Database Breaking Changes
- Removing columns
- Changing column types
- Renaming tables/columns
- Removing default values
- Adding NOT NULL without default

### API Breaking Changes
- Removing endpoints
- Changing endpoint paths
- Removing request/response fields
- Changing field types
- Making optional fields required

### Assessing Breaking Change Impact

When reviewing data model or API changes, flag the degree to which a change will be breaking for existing integrations:

| Impact Level | Description | Examples |
|--------------|-------------|----------|
| **Non-breaking** | Additive changes only | New optional fields, new endpoints |
| **Minor** | Changes with easy migration | New required field with sensible default |
| **Breaking** | Requires consumer changes | Removing fields, changing types, renaming |
| **Critical** | High-risk breaking change | Core entity restructuring, auth changes |

For breaking changes:
- [ ] Document in PR description with clear migration guidance
- [ ] Consider versioning strategy if impact is widespread
- [ ] Flag for SDK package updates in a follow-up PR

## Cross-System Consistency

### Schema → API Flow
1. Schema changes affect database structure
2. API contracts may need updates to reflect new data
3. CI will verify OpenAPI spec is up to date
4. Documentation should reflect changes

### Validation Points
- [ ] Zod schemas in API contracts match database schema
- [ ] Type exports include new types
- [ ] Error types defined for new failure modes
- [ ] Namespace includes all required type declarations

## Router Patterns

### OpenAPI Meta Generation
Routers use `generateOpenApiMetas` for consistent OpenAPI documentation:

```typescript
const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'customer',
  tags: ['Customer'],
  idParamOverride: 'externalId',  // Optional: use externalId instead of id
})

export const customersRouteConfigs = routeConfigs
```

### Procedure Wrappers
Use the appropriate transaction wrapper:

| Wrapper | Use Case |
|---------|----------|
| `authenticatedProcedureTransaction` | Basic authenticated transaction |
| `authenticatedProcedureComprehensiveTransaction` | Includes cache invalidation, event emission, ledger commands |
| `authenticatedTransaction` | Direct transaction without procedure context |

**Important:** Comprehensive transactions return `Result.ok(value)`, not the value directly.

### Consistent Output Wrapping
Always wrap single entities in an object with the entity name:

```typescript
.output(z.object({ customer: customerClientSelectSchema }))
.output(z.object({ subscription: subscriptionClientSelectSchema }))
```

### Pagination Patterns
The codebase uses two pagination styles:

1. **Keyset pagination** via `createPaginatedSelectFunction`:
   - Uses `cursor`, `nextCursor`, `hasMore`, `total`
   - For simple list endpoints

2. **Relay-style cursor pagination** via `createCursorPaginatedSelectFunction`:
   - Uses `startCursor`, `endCursor`, `hasNextPage`, `hasPreviousPage`
   - For table row data endpoints with enrichment

## Patterns Easily Overlooked

These are patterns that agents with limited codebase context commonly miss:

### 1. Client Schema Auto-Restrictions
`buildSchemas` automatically:
- Makes `livemode` and `organizationId` read-only
- Omits `id`, `createdAt`, `updatedAt`, `position`, `createdByCommit`, `updatedByCommit` from insert schemas
- **Don't manually add these restrictions**

### 2. Discriminated Unions Require Variant-Specific Schemas
When adding a new variant to a discriminated union:
- Create a separate `buildSchemas` call with the discriminator value in the refinement
- The discriminator must be included in `refine` or `updateRefine`
- Then combine variants into a `z.discriminatedUnion`

### 3. Hidden vs Read-only vs Create-only Semantics
| Access Level | In Select | In Insert | In Update |
|--------------|-----------|-----------|-----------|
| Hidden | No | No | No |
| Read-only | Yes | No | No |
| Create-only | Yes | Yes | No |

### 4. RLS Policies and FK Indexes
- **Always add indexes on foreign key columns** for query performance
- Tables without direct `organizationId` must scope access through parent FK relationships
- Use `livemodeIndex` helper for composite indexes with livemode

### 5. The Result Pattern
Comprehensive transactions (`authenticatedProcedureComprehensiveTransaction`) return `Result.ok(value)`:

```typescript
// Correct
return Result.ok({ customer: createdCustomer })

// Incorrect - don't return value directly
return { customer: createdCustomer }
```

### 6. Timestamps Are Epoch Milliseconds
- All timestamps use epoch milliseconds via `timestamptzMs`
- `buildSchemas` automatically adds `zodEpochMs` refinements
- Input/output uses numbers (epoch ms), not Date objects
- **Don't manually add timestamp refinements**

### 7. Pagination Uses Two Patterns
- `createPaginatedSelectFunction` - keyset pagination with `cursor`/`nextCursor`
- `createCursorPaginatedSelectFunction` - relay-style with `startCursor`/`endCursor`
- Match the pattern used by similar endpoints in the codebase
