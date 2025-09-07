# Test Fix Checklist

## Test Fixes Organized by Priority

### Category 1: Timeout/Configuration Issues (Priority 1)

#### Guide for Timeout Issues:
1. Check if test has explicit timeout configuration
2. Increase timeout value for long-running integration tests
3. Verify database connections are properly established
4. Check for deadlocks in transaction code
5. Ensure proper async/await handling

#### Tests to Fix:
- [ ] **src/db/customerRLS.test.ts** - "should prevent customerA from seeing customerB data in same org"
  - Current timeout: 5000ms
  - Action: Increase timeout to 10000ms or add explicit timeout parameter
  - Location: Line ~265
  - Fix approach:
    ```typescript
    it('should prevent customerA from seeing customerB data in same org', async () => {
      // test code
    }, 10000) // Add timeout parameter
    ```

### Category 2: Database/Transaction Issues (If timeout fix doesn't resolve)

#### Guide for Database Transaction Issues:
1. Verify database is properly initialized before test
2. Check RLS policies are correctly set up
3. Ensure transactions are properly committed/rolled back
4. Look for circular dependencies in RLS policies
5. Verify JWT claims are correctly formatted

#### Potential Fixes:
- [ ] Check `authenticatedCustomerTransaction` helper function for proper JWT claim setup
- [ ] Verify RLS policies in database schema allow customer role queries
- [ ] Ensure database cleanup between tests (afterEach hooks)
- [ ] Check for proper transaction isolation levels

## Implementation Steps

### Step 1: Fix Timeout Issue
1. Open `src/db/customerRLS.test.ts`
2. Locate the failing test around line 265
3. Add explicit timeout parameter to the test
4. Run the specific test to verify fix

### Step 2: Verify Database Setup (if needed)
1. Check test setup/teardown hooks
2. Verify database connection configuration
3. Ensure RLS policies are properly migrated

### Step 3: Run Targeted Test
```bash
pnpm test src/db/customerRLS.test.ts --run
```

### Step 4: Run Full Test Suite
```bash
pnpm test --run
```

## Test Categories Summary

### Tests Fixed Due to Being Outdated
1. Timeout configuration issues

### Tests Fixed Due to Code Issues
(To be determined after timeout fix)

## Verification Commands

After each fix:
```bash
# Run specific test file
pnpm test <test-file-path> --run

# Run with verbose output
pnpm test <test-file-path> --run --reporter=verbose
```