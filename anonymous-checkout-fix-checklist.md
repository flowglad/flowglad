# Test Fix Checklist for Anonymous Checkout Branch

## Priority 1: Test Mock Issues (Outdated Tests)

### Guide for Fixing Mock Issues:
1. Identify all places where `getStripeCharge` is called
2. Ensure mocks are set up before test execution
3. Mock should return proper charge object structure
4. Verify mock is imported and configured correctly

### Tests to Fix:
- [ ] **Billing Run Flow - correctly processes payment**
  - File: `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts`
  - Line: ~532
  - Action: Add mock for `getStripeCharge` to return valid charge
  ```typescript
  vi.mocked(getStripeCharge).mockResolvedValue({
    id: 'ch_br',
    // ... other charge properties
  })
  ```

- [ ] **Billing Run Flow - throws error when no invoice exists**
  - File: `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts`
  - Line: ~599
  - Action: Mock `getStripeCharge` to return charge, allowing test to reach billing run check
  ```typescript
  vi.mocked(getStripeCharge).mockResolvedValue({
    id: 'ch_br_err',
    // ... minimal charge properties
  })
  ```

## Priority 2: Schema/Code Issues

### Guide for Fixing Schema Issues:
1. Review the purchase update schema
2. Check what types are expected vs what's being provided
3. Update test data to match schema requirements
4. Consider if schema changes are intentional

### Tests to Fix:
- [ ] **Event Creation - PaymentSucceeded and PurchaseCompleted events**
  - File: `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts`
  - Line: Event creation tests section
  - Issue: ZodError - invalid union type for purchase update
  - Action: 
    1. Check purchase schema for expected types
    2. Update test data to provide correct `type` field
    3. Ensure purchase object has all required fields

## Implementation Steps

### Step 1: Set up proper mocks
1. Import `getStripeCharge` mock at top of test file
2. Add `vi.mock()` for the module if not present
3. In each test, set up mock before calling the function

### Step 2: Fix schema issues
1. Review purchase schema in `src/db/schema/purchases.ts`
2. Check what `type` values are valid
3. Update test data to match

### Step 3: Run specific tests
```bash
# Test individual file
pnpm test src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts --run

# Test specific test case
pnpm test src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts -t "Billing Run Flow"
```

### Step 4: Verify all tests pass
```bash
pnpm test --run
```

## Additional Checks
- [ ] Verify all imports are correct
- [ ] Check if there are any new dependencies needed
- [ ] Ensure test database is properly configured
- [ ] Review if any other tests use similar patterns that need updating