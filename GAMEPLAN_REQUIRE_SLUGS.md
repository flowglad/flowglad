# Gameplan: Require Slugs for Products and Prices

## Project Name
`require-slugs-products-prices`

## Problem Statement
Products and prices allow null slugs, while other entities (features, resources, usageMeters) require them. This inconsistency causes the diffing system to have fragile runtime fallback logic that generates slugs from immutable fields. These generated slugs can collide and make matching unreliable during pricing model updates.

## Solution Summary
1. Make `slug` **required** in the input schema for prices (matching features/usage meters pattern)
2. Validation will fail at schema level if user doesn't provide a slug - no auto-generation
3. Create a backfill script to populate null slugs for existing records
4. Add NOT NULL constraint to the slug columns via migration
5. Remove the fallback slug generation logic from diffing.ts

**Key insight:** Features and usage meters already follow this pattern - if you don't provide a slug in the YAML, validation fails immediately. We're extending this same pattern to prices. This is simpler than auto-generation because:
- Clear API contract: users must provide slugs
- No runtime auto-generation complexity
- Validation fails early with clear error messages
- Diffing becomes trivial (just use `p.slug` directly)

## Current State Analysis

**Schema inconsistency:**
| Entity | Slug Required? |
|--------|---------------|
| features | `.notNull()` |
| resources | `.notNull()` |
| usageMeters | `.notNull()` |
| **products** | nullable |
| **prices** | nullable |

**Key files with `slug ?? null` patterns:**
- `src/utils/pricingModels/setupHelpers.ts:35` - product price creation
- `src/utils/pricingModels/setupTransaction.ts:258` - usage price creation
- `src/utils/pricingModels/updateTransaction.ts:228,325,384` - price updates
- `src/db/schema/prices.ts:113` - schema definition
- `src/db/schema/products.ts:75` - schema definition

**Fallback slug generation in diffing.ts:331-347:**
```ts
const getUsagePriceSlug = (price: SetupUsageMeterPriceInput): string => {
  if (price.slug) {
    return price.slug
  }
  // Fallback: fragile generated slug
  return `__generated__${price.unitPrice}_${price.usageEventsPerUnit}_${currency}_${intervalCount}_${intervalUnit}`
}
```

## Required Changes

### Input Schema Changes (matching features/usage meters pattern)

Make `slug` required in price input schemas so validation fails if not provided:

1. **`src/utils/pricingModels/setupSchemas.ts:97-101`**
   ```ts
   // Change from:
   const priceOptionalFieldSchema = {
     currency: currencyCodeSchema.optional(),
     name: safeZodSanitizedString.optional(),
     slug: safeZodSanitizedString.optional(),  // ← optional
   }

   // To:
   const priceOptionalFieldSchema = {
     currency: currencyCodeSchema.optional(),
     name: safeZodSanitizedString.optional(),
     slug: safeZodSanitizedString,  // ← REQUIRED (no .optional())
   }
   ```

2. **`src/utils/pricingModels/setupHelpers.ts:35`**
   - Change `slug: price.slug ?? null` to `slug: price.slug` (now guaranteed by schema)

3. **`src/utils/pricingModels/setupTransaction.ts:213`**
   - Change `slug: price.slug ?? null` to `slug: price.slug` (now guaranteed by schema)

4. **`src/utils/pricingModels/diffing.ts:330-343`**
   - Remove `getUsagePriceSlug` fallback - just use `price.slug` directly

5. **`src/db/schema/prices.ts:124`**
   - After backfill: Change `slug: text('slug')` to `slug: text('slug').notNull()`

6. **`src/db/schema/products.ts:75`**
   - After backfill: Change `slug: text('slug')` to `slug: text('slug').notNull()`

### Backfill Utilities (for existing null data only)

Create `src/utils/slugHelpers.ts` with minimal utilities for the backfill script:
```ts
/**
 * Converts a string to snake_case slug format.
 * Example: "Pro Plan" -> "pro_plan"
 */
export const toSlug = (str: string): string

/**
 * Generates a slug for a price using the parent slug pattern.
 * Format: {parentSlug}_price_{nanoid}
 */
export const generatePriceSlug = (parentSlug: string): string

/**
 * Generates a slug for a product based on its name.
 */
export const generateProductSlug = (productName: string): string
```

**Note:** These utilities are ONLY used by the backfill script. Going forward, users must provide slugs explicitly - no auto-generation at runtime.

### Backfill script

Create `src/scripts/backfill-slugs.ts`:
```ts
/**
 * Backfills null slugs for prices and products.
 * Run this BEFORE adding the NOT NULL constraint.
 *
 * Usage: bun run src/scripts/backfill-slugs.ts [--dry-run]
 */
```

## Acceptance Criteria
- [ ] All newly created prices have non-null slugs
- [ ] All newly created products have non-null slugs
- [ ] All existing prices with null slugs have been backfilled
- [ ] All existing products with null slugs have been backfilled
- [ ] Database schema has NOT NULL constraint on prices.slug
- [ ] Database schema has NOT NULL constraint on products.slug
- [ ] `getUsagePriceSlug` fallback logic is removed from diffing.ts
- [ ] All tests pass with no `slug: null` test data (updated to use generated slugs)
- [ ] Unique constraint on (pricingModelId, slug) is preserved for products

## Open Questions
1. ~~Should generated price slugs include the price type?~~ **Resolved:** No, just use snake_case of name.
2. Should we add a unique constraint on price slugs within a pricing model, similar to products?
3. ~~For the backfill, should we use name-based generation or nanoid?~~ **Resolved:** See backfill strategy below.

## Data Model Constraints

**Non-usage prices (subscription/single_payment):**
- Have a productId (not null)
- One active price per product (1:1 relationship)
- Slugs must be unique per product (effectively per pricing model)

**Usage prices:**
- Have no productId (null), but have usageMeterId
- Many active prices per usage meter (many:1 relationship)
- Slugs must be unique within the usage meter

## Backfill Strategy

**Order matters:** Products must be backfilled BEFORE prices, since price slugs depend on product/meter slugs.

**Products:** Use `snake_case(product.name)` - products always have names (notNull).

**All prices (unified pattern):**
- Non-usage: `{product_slug}_price_{nanoid}`
- Usage: `{meter_slug}_price_{nanoid}`

No conditional logic - all backfilled prices follow this pattern regardless of whether they have names.

**Going forward (new prices):**
- Users MUST provide slugs explicitly in the input (schema requires it)
- Validation will fail with clear error if slug is missing
- Suggested pattern for users: `{parent_slug}_price_{descriptive_name}` (e.g., `api_calls_price_standard`)

## Explicit Opinions
1. **Require slugs in input schema, don't auto-generate at runtime.** This matches the existing pattern for features and usage meters. Validation fails early with clear errors if slug is missing.
2. **Backfill existing null slugs before requiring them.** Products get `snake_case(name)`, prices get `{parent_slug}_price_{nanoid}`.
3. **Backfill before adding NOT NULL constraint.** The migration must be done in two phases to avoid data loss.
4. **Backfill products before prices.** Price slugs depend on product slugs being populated first.
5. **No runtime auto-generation.** Users must explicitly provide slugs going forward. This is simpler and more predictable than magic auto-generation.

## Patches

### Patch 1: Make slug required in price input schemas
**Files:**
- Modify: `src/utils/pricingModels/setupSchemas.ts`

**Changes:**
- Change `slug: safeZodSanitizedString.optional()` to `slug: safeZodSanitizedString` in `priceOptionalFieldSchema`

**Tests:**
```ts
describe('setupPricingModelSchema validation', () => {
  it('rejects price input without slug', () => {
    // setup: price input missing slug field
    // expect: validation throws error "slug is required" or similar
  })

  it('accepts price input with valid slug', () => {
    // setup: price input with slug='my_price_slug'
    // expect: validation passes
  })
})
```

### Patch 2: Update price creation paths to expect slug
**Files:**
- Modify: `src/utils/pricingModels/setupHelpers.ts`
- Modify: `src/utils/pricingModels/setupTransaction.ts`

**Changes:**
- Change `slug: price.slug ?? null` to `slug: price.slug` (schema guarantees it exists)

**No new tests needed** - existing tests will verify behavior, just need to update test data to include slugs.

### Patch 3: Create backfill utilities and script
**Files:**
- Create: `src/utils/slugHelpers.ts` (minimal utilities for backfill only)
- Create: `src/scripts/backfill-slugs.ts`

**Changes:**
- Script that runs in order:
  1. **Products with null slugs (FIRST):**
     - Generate slug as `snake_case(product.name)`
     - Update in batches
  2. **Non-usage prices with null slugs:**
     - Join with products table to get product slug
     - Generate slug as `{product_slug}_price_{nanoid}`
     - Update in batches
  3. **Usage prices with null slugs:**
     - Join with usage_meters table to get meter slug
     - Generate slug as `{meter_slug}_price_{nanoid}`
     - Update in batches
  4. Report counts for each category and any failures

**SQL for identifying records:**
```sql
-- Products with null slugs
SELECT id, name FROM products WHERE slug IS NULL;

-- Non-usage prices with null slugs (after product backfill)
SELECT p.id, prod.slug as product_slug
FROM prices p
JOIN products prod ON p.product_id = prod.id
WHERE p.slug IS NULL AND p.type != 'usage';

-- Usage prices with null slugs
SELECT p.id, um.slug as meter_slug
FROM prices p
JOIN usage_meters um ON p.usage_meter_id = um.id
WHERE p.slug IS NULL AND p.type = 'usage';
```

**Tests:**
- Manual verification via `--dry-run` flag
- Run against staging/production with careful monitoring

### Patch 4: Add NOT NULL constraint via migration
**Files:**
- Modify: `src/db/schema/prices.ts:124`
- Modify: `src/db/schema/products.ts:75`
- Generate: New migration file via `bun run migrations:generate`

**Changes:**
```ts
// prices.ts - change from:
slug: text('slug'),
// to:
slug: text('slug').notNull(),

// products.ts - change from:
slug: text('slug'),
// to:
slug: text('slug').notNull(),
```

**Pre-requisite:** Patch 3 (backfill) must be run in production before this migration is applied.

### Patch 5: Remove fallback slug generation from diffing.ts
**Files:**
- Modify: `src/utils/pricingModels/diffing.ts`

**Changes:**
- Remove `getUsagePriceSlug` function (lines 330-343)
- Update `toSluggedUsagePrices` to directly use `price.slug` (now guaranteed non-null by schema)

```ts
// Before:
const toSluggedUsagePrices = (prices: SetupUsageMeterPriceInput[]): SluggedResource<SetupUsageMeterPriceInput>[] => {
  return prices.map((p) => ({
    ...p,
    slug: getUsagePriceSlug(p),
  }))
}

// After:
const toSluggedUsagePrices = (prices: SetupUsageMeterPriceInput[]): SluggedResource<SetupUsageMeterPriceInput>[] => {
  return prices.map((p) => ({
    ...p,
    slug: p.slug, // Now guaranteed by input schema validation
  }))
}
```

**No new tests needed** - the schema validation in Patch 1 ensures slugs are always present. If somehow a null slug reaches diffing, TypeScript will catch it at compile time.

### Patch 6: Update tests to use explicit slugs
**Files:**
- Modify: `src/db/authenticatedTransaction.test.ts`
- Modify: `src/db/schema/products.test.ts`
- Modify: `src/server/routers/productsRouter.test.ts`
- Modify: `src/server/routers/pricesRouter.test.ts`
- Modify: `src/utils/pricingModel.test.ts`
- Modify: `src/utils/pricingModel.isPriceChanged.test.ts`

**Changes:**
- Replace all `slug: null` and `slug: undefined` test data with explicit slugs
- Update any test assertions that expected null slug behavior

## Dependency Graph
```
Patch 1 (schema) ─────┬─→ Patch 2 (creation paths) ─→ Patch 5 (remove diffing fallback)
                      │
                      └─→ Patch 6 (tests)

Patch 3 (backfill) ───→ Patch 4 (DB NOT NULL)
```

**Deployment order:**
1. Deploy Patches 1, 2, 5, 6 together (code changes)
2. Run Patch 3 in production (backfill existing data)
3. Deploy Patch 4 (add NOT NULL constraint)

Note: Patch 3 (backfill) must be executed in production before Patch 4 (migration) is deployed. This is an operational dependency, not a code dependency.
