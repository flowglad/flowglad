# Failed Tests Report

## Test Results Summary
- **Total Failed Tests**: 29
- **Timeout Errors**: 5
- **Non-Timeout Errors**: 24

## Failed Tests Table

| Test Description | Test Location | Code Being Tested Location | Is Timeout Error |
|------------------|---------------|----------------------------|------------------|
| should prevent customerA from seeing customerB data in same org | `src/db/customerRLS.test.ts:409` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should prevent customerB from seeing customerA data in same org | `src/db/customerRLS.test.ts:470` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should isolate subscriptions between customers in same org | `src/db/customerRLS.test.ts:521` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should prevent canceling other customers subscriptions | `src/db/customerRLS.test.ts:620` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should prevent customerA_Org1 from accessing any data in Org2 | `src/db/customerRLS.test.ts:660` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should maintain isolation between different users in different orgs | `src/db/customerRLS.test.ts:711` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should prevent customerD_Org2 from accessing any Org1 data | `src/db/customerRLS.test.ts:778` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should filter queries with WHERE conditions correctly | `src/db/customerRLS.test.ts:818` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should handle empty results gracefully | `src/db/customerRLS.test.ts:875` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should only return authenticated customers data in billing queries | `src/db/customerRLS.test.ts:940` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should prevent subscription cancellation for other customers | `src/db/customerRLS.test.ts:1008` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| should handle customer with multiple subscriptions correctly | `src/db/customerRLS.test.ts:1055` | `src/db/customerRLS.test.ts` (RLS policies) | No |
| correctly processes a payment when metadata contains a billingRunId and a valid subscription | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:491` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:325` | No |
| throws an error when no invoice exists for the billing run | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:567` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:325` | No |
| should create PaymentSucceeded and PurchaseCompleted events when payment succeeds and purchase becomes paid | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:887` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:332` | No |
| should create only PaymentSucceeded event when payment succeeds but purchase does not become paid | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:995` | `src/db/tableUtils.ts:318` | No |
| should create only PaymentSucceeded event when payment succeeds without associated purchase | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:1076` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:332` | No |
| should create only PaymentFailed event when payment intent is canceled | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:1156` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:332` | No |
| should create no events when payment intent status is processing | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:1229` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:332` | No |
| should create events with correct properties and structure | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts:1295` | `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:332` | No |
| returns complete billing information without pagination | `src/server/routers/customerBillingPortalRouter.integration.test.ts:254` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | No |
| returns paginated billing data when pagination parameters provided | `src/server/routers/customerBillingPortalRouter.integration.test.ts:302` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | No |
| returns correct page of invoices for pagination | `src/server/routers/customerBillingPortalRouter.integration.test.ts:369` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | No |
| successfully sets default payment method | `src/server/routers/customerBillingPortalRouter.integration.test.ts:662` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | No |
| updates subscriptions to use new default payment method | `src/server/routers/customerBillingPortalRouter.integration.test.ts:758` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | No |
| throws error when trying to set another customer's payment method as default | `src/server/routers/customerBillingPortalRouter.integration.test.ts:717` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | **Yes** |
| handles empty invoice list correctly with pagination | `src/server/routers/customerBillingPortalRouter.integration.test.ts:330` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | **Yes** |
| cancels subscription immediately | `src/server/routers/customerBillingPortalRouter.integration.test.ts:423` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | **Yes** |
| schedules subscription cancellation at period end | `src/server/routers/customerBillingPortalRouter.integration.test.ts:459` | `src/server/routers/customerBillingPortalRouter.integration.test.ts` (integration test) | **Yes** |

## Error Analysis

### Non-Timeout Errors (24 tests)
1. **Customer RLS Tests (12 failures)**: All customer role-based access control tests are failing, indicating issues with database row-level security policies.

2. **Payment Intent Processing Tests (8 failures)**: Multiple failures in payment processing logic:
   - Schema validation errors with `stripeIntentMetadataSchema.parse()` at line 332
   - "No charge found for payment intent" errors at line 325
   - Database update failures in `tableUtils.ts` at line 318

3. **Billing Portal Integration Tests (4 failures)**: Integration tests failing without timeout, suggesting logic or setup issues.

### Timeout Errors (5 tests)
All timeout errors are in the `customerBillingPortalRouter.integration.test.ts` file:
- Test timeouts ranging from 5000ms to 18000ms
- All related to billing portal functionality (pagination, payment methods, subscription cancellation)
- Suggests potential database connection issues, slow queries, or infinite loops in integration test setup

## Recommendations
1. **RLS Policy Issues**: Review and fix database row-level security policies for customer data isolation
2. **Schema Validation**: Fix `stripeIntentMetadataSchema` validation issues in payment processing
3. **Integration Test Timeouts**: Investigate database setup, connection pooling, and test isolation for billing portal tests
4. **Charge Lookup**: Fix "No charge found" errors in payment intent processing
