# Failing Tests in Anonymous Checkout Branch

## Test Failures Summary

| Category | Test Location | Code Being Tested | Failure Reason | Test Status |
|----------|---------------|-------------------|----------------|-------------|
| Payment Processing | src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:~Line 532 | Billing Run Flow - correctly processes a payment when metadata contains a billingRunId | Mock setup issue - getStripeCharge not returning expected mock | Test outdated - mock needs update |
| Payment Processing | src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:~Line 599 | Billing Run Flow - throws error when no invoice exists | Test expects "No billing runs found" but gets "No charge found" error earlier | Test outdated - error thrown at different point |
| Event Creation | src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:~Line 1200+ | Event Creation - PaymentSucceeded and PurchaseCompleted events | ZodError in purchase update - invalid union type | Code issue - schema mismatch |

## Detailed Analysis

### 1. Billing Run Payment Processing Test
- **Issue**: The test mock for `getStripeCharge` is not returning the expected charge object
- **Location**: Line ~532 in test file
- **Fix needed**: Update mock setup to properly return charge data

### 2. Billing Run Error Handling Test  
- **Issue**: Error is thrown at line 325 (No charge found) before reaching the expected error location
- **Location**: Line 599 in test file
- **Current behavior**: Throws "No charge found for payment intent pi_br_err"
- **Expected behavior**: Should throw "No billing runs found with id: br_err"
- **Fix needed**: Add mock for getStripeCharge to allow test to proceed to billing run check

### 3. Event Creation Test
- **Issue**: ZodError when updating purchases - schema validation failure
- **Error details**: Invalid union type, expecting "subscription" but getting different value
- **Location**: Event creation tests
- **Fix needed**: Update purchase schema or test data to match expected types

## Root Causes
1. **Missing mocks**: Tests don't properly mock `getStripeCharge` function
2. **Code flow changes**: The implementation now checks for charge existence earlier in the flow
3. **Schema changes**: Purchase update schema has changed but tests not updated

## Statistics
- **Failing tests**: At least 3 tests in processPaymentIntentStatusUpdated.test.ts
- **Category**: All failures relate to payment intent processing with new anonymous checkout flow
- **Impact**: Critical - affects core payment processing functionality