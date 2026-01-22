# Test Failures TODO

Summary: **All tests passing** - 4134 pass, 2 skip, 0 fail (100% pass rate)

---

## Completed Fixes

### Category 1: RLS Policy / Test Isolation Issues (FIXED)

The RLS/usageEvents test failures were caused by mock pollution from other tests (Category 2). Once mock restoration was fixed, these tests also started passing.

### Category 2: Mock/Stub Pollution Issues (FIXED)

**Root Cause**: Tests using `spyOn()` were calling `mock.clearAllMocks()` instead of `mock.restore()` in their `afterEach` hooks. `clearAllMocks()` only resets call counts, but `restore()` actually restores the original function implementations.

**Files Fixed**:
- `src/utils/bookkeeping/customerBilling.test.ts` - Changed `mock.clearAllMocks()` to `mock.restore()`
- `integration-tests/server/routers/customerBillingPortalRouter.flow.test.ts` - Changed `mock.clearAllMocks()` to `mock.restore()`
- `src/server/trpcErrorHandler.test.ts` - Added `afterEach` with `mock.restore()`

### Category 3: Assertion Pattern Issues (FIXED)

**Root Cause**: `.resolves.not.toThrow()` doesn't work correctly in bun:test for functions that return values.

**File Fixed**: `src/db/tableMethods/priceMethods.test.ts`
- Removed `.resolves.not.toThrow()` wrapper and just awaited the transaction directly

### Category 4: Test Data Ordering Issues (FIXED)

**Root Cause**: Tests assumed specific ordering of database results that isn't guaranteed.

**File Fixed**: `src/db/tableMethods/billingPeriodItemMethods.test.ts`
- Added sorting by name before assertions to ensure deterministic ordering

---

## Key Learnings

1. **In bun:test, always use `mock.restore()` in `afterEach`** when using `spyOn()` - `clearAllMocks()` is not sufficient to restore original implementations

2. **Avoid `.resolves.not.toThrow()` pattern** - Instead, just await the function and let it throw if there's an error

3. **Sort database results before asserting** - Never assume database ordering unless explicitly specified in the query
