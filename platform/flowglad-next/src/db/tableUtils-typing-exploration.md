# TypeScript Typing Exploration for `createNotExpiredFilter`

## Overview
This document explores different approaches to typing the `expiredAtColumn` parameter in the `createNotExpiredFilter` function, which consolidates SQL expiration filtering logic across the codebase.

## The Function
```typescript
export const createNotExpiredFilter = (
  expiredAtColumn: [TYPE_GOES_HERE],
  anchorDate: string | number | Date = Date.now()
): SQL | undefined => {
  const anchorTime = typeof anchorDate === 'string' || typeof anchorDate === 'number' 
    ? new Date(anchorDate).getTime()
    : anchorDate.getTime()
    
  // Create the condition that records are not expired
  // This means: expiredAt IS NULL OR expiredAt > anchorTime
  return or(
    isNull(expiredAtColumn),
    gt(expiredAtColumn, anchorTime)
  )
}
```

## Approach 1: Complex Explicit Type ✅ (Passes Lint)

**Implementation:**
```typescript
// Type for timestamp columns created with timestamptzMs
type TimestampColumn = PgColumn<
  {
    name: string;
    dataType: "custom";
    columnType: "PgCustomColumn";
    data: number;
    driverParam: string | Date;
    tableName: string;
    notNull: boolean;
    hasDefault: boolean;
    isPrimaryKey: boolean;
    isAutoincrement: boolean;
    hasRuntimeDefault: boolean;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  } & Record<string, any>,
  {},
  {
    pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
  }
>

export const createNotExpiredFilter = (
  expiredAtColumn: TimestampColumn,
  anchorDate: string | number | Date = Date.now()
): SQL | undefined => {
```

**Pros:**
- ✅ Maximum type safety
- ✅ Catches errors at compile time
- ✅ Self-documenting
- ✅ Prevents wrong column types
- ✅ Passes linting

**Cons:**
- ❌ Very verbose (25+ lines)
- ❌ Brittle - could break with Drizzle updates
- ❌ Complex to understand
- ❌ Over-engineered for a utility function
- ❌ Hard to maintain

**Status:** ✅ Works but over-engineered

---

## Approach 2: Clean PgTimestampColumn ❌ (Doesn't Pass Lint Yet)

**Implementation:**
```typescript
// In types.ts
export type PgTimestampColumn = PgColumn<
  ColumnBaseConfig<'custom', 'number'>,
  {},
  {}
>

// In tableUtils.ts
export const createNotExpiredFilter = (
  expiredAtColumn: PgTimestampColumn,
  anchorDate: string | number | Date = Date.now()
): SQL | undefined => {
```

**Pros:**
- ✅ Clean and readable
- ✅ Follows existing patterns in codebase
- ✅ Self-documenting type name
- ✅ Reusable across codebase
- ✅ Matches existing `PgNumberColumn`, `PgStringColumn` pattern

**Cons:**
- ❌ Currently doesn't pass linting
- ❌ May need additional properties to satisfy `ColumnBaseConfig` constraints

**Status:** ❌ Needs investigation to make it work

**Error Details:**
The `PgTimestampColumn` approach fails with TypeScript errors because the actual column types don't match the expected `ColumnBaseConfig<'custom', 'number'>` structure.

| Property | Expected (ColumnBaseConfig) | Actual (Real Column) | Match |
|----------|----------------------------|---------------------|-------|
| `dataType` | `'custom'` | `'custom'` | ✅ |
| `columnType` | `'number'` | `'PgCustomColumn'` | ❌ |
| `data` | `number` | `number` | ✅ |
| `driverParam` | Not specified | `string \| Date` | ❌ |
| `tableName` | Not specified | `"ledger_entries"` etc. | ❌ |
| `notNull` | Not specified | `boolean` | ❌ |
| `hasDefault` | Not specified | `boolean` | ❌ |
| `isPrimaryKey` | Not specified | `boolean` | ❌ |
| `isAutoincrement` | Not specified | `boolean` | ❌ |
| `hasRuntimeDefault` | Not specified | `boolean` | ❌ |
| `enumValues` | Not specified | `undefined` | ❌ |
| `baseColumn` | Not specified | `never` | ❌ |
| `identity` | Not specified | `undefined` | ❌ |
| `generated` | Not specified | `undefined` | ❌ |

**Key Issue:** The `columnType` mismatch (`'number'` vs `'PgCustomColumn'`) is the primary blocker, but there are many other missing properties that the actual columns have.

---

## Approach 3: Simple Permissive Type ✅ (Passes Lint)

**Implementation:**
```typescript
export const createNotExpiredFilter = (
  expiredAtColumn: PgColumn<any, {}, {}>,
  anchorDate: string | number | Date = Date.now()
): SQL | undefined => {
```

**Pros:**
- ✅ Simple and readable
- ✅ Flexible - works with any Drizzle column
- ✅ Future-proof - won't break with Drizzle updates
- ✅ Still better than `any` - ensures it's a Drizzle column
- ✅ Passes linting
- ✅ Easy to maintain

**Cons:**
- ❌ Less type safety than explicit types
- ❌ Could accept wrong column types (though still better than `any`)
- ❌ Less self-documenting

**Status:** ✅ Works and is pragmatic

---

## Current Usage Patterns

The function is used with these column types:
- `ledgerEntries.discardedAt` - manually discarded ledger entries
- `ledgerEntries.expiredAt` - naturally expired ledger entries  
- `subscriptionItems.expiredAt` - expired subscription items
- `productFeatures.expiredAt` - expired product features

All are created with `timestampWithTimezoneColumn('expired_at')` which calls `timestamptzMs`.

## Recommendation

**For Production:** Approach 3 (`PgColumn<any, {}, {}>`) is recommended because:
- It's the sweet spot between type safety and simplicity
- It's maintainable and won't break with Drizzle updates
- It still prevents passing non-column types
- It's pragmatic for a utility function

**For Learning:** Approach 2 is worth pursuing to understand Drizzle's type system better, but may require additional investigation into `ColumnBaseConfig` requirements.

## Next Steps

If pursuing Approach 2, investigate:
1. What additional properties `ColumnBaseConfig` requires
2. Whether `ColumnBaseConfig<'custom', 'number'>` can be extended
3. How to make it compatible with the actual column types in the codebase
