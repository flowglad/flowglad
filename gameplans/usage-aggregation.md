# Game Plan: Usage Aggregation and Subscription Credits

This document outlines the plan to implement `SubscriptionUsageMeter` for tracking aggregated usage and `SubscriptionUsageCredits` for managing customer credits, enabling accurate billing and flexible credit/debit capabilities.

## 1. Database Schema Changes

We'll introduce two new tables: `subscription_usage_meters` and `subscription_usage_credits`.

### 1.1. `subscription_usage_meters` Table

This table will store the aggregated usage for each subscription, for each usage meter, within a specific billing period.

```sql
CREATE TABLE subscription_usage_meters (
    id TEXT PRIMARY KEY DEFAULTNanoid('sub_usage_meter'), -- Primary Key
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id), -- Foreign Key to subscriptions
    usage_meter_id TEXT NOT NULL REFERENCES usage_meters(id), -- Foreign Key to usage_meters
    billing_period_id TEXT NOT NULL REFERENCES billing_periods(id), -- Foreign Key to billing_periods
    organization_id TEXT NOT NULL REFERENCES organizations(id), -- Foreign Key to organizations
    livemode BOOLEAN NOT NULL,

    total_raw_usage_amount INTEGER NOT NULL DEFAULT 0, -- Sum of all usage_event.amount for this meter in this period
    credits_applied_amount INTEGER NOT NULL DEFAULT 0, -- Total monetary value of credits applied
    net_billed_amount INTEGER NOT NULL DEFAULT 0, -- (total_raw_usage_amount * unit_price_of_meter) - credits_applied_amount (or similar logic based on pricing)
    
    -- Consider if pricing information (like unit price at the time of aggregation) needs to be snapshotted here
    -- or if it's always derived from the associated price/meter configuration at the time of billing.
    -- For simplicity now, we assume it's derived.

    status TEXT NOT NULL DEFAULT 'open', -- e.g., 'open', 'billed', 'closed' 
                                       -- (reflecting the billing period's state for this meter)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (subscription_id, usage_meter_id, billing_period_id) -- Ensure one record per sub/meter/period
);

-- Indexes
CREATE INDEX idx_sub_usage_meters_subscription_id ON subscription_usage_meters(subscription_id);
CREATE INDEX idx_sub_usage_meters_usage_meter_id ON subscription_usage_meters(usage_meter_id);
CREATE INDEX idx_sub_usage_meters_billing_period_id ON subscription_usage_meters(billing_period_id);
CREATE INDEX idx_sub_usage_meters_organization_id ON subscription_usage_meters(organization_id);
```

**Zod Schema (`subscriptionUsageMeters.ts`):**
*   Define `subscriptionUsageMeters` Drizzle schema.
*   Define `subscriptionUsageMetersInsertSchema`, `subscriptionUsageMetersSelectSchema`, `subscriptionUsageMetersUpdateSchema`.
*   Define client-side schemas and types.

### 1.2. `subscription_usage_credits` Table

This table will store records of credits issued to subscriptions.

```sql
CREATE TABLE subscription_usage_credits (
    id TEXT PRIMARY KEY DEFAULT Nanoid('sub_credit'), -- Primary Key
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id), -- Foreign Key to subscriptions
    organization_id TEXT NOT NULL REFERENCES organizations(id), -- Foreign Key to organizations
    livemode BOOLEAN NOT NULL,

    -- If null, credit applies to any usage meter on the subscription.
    -- If specified, credit is specific to this usage meter.
    usage_meter_id TEXT REFERENCES usage_meters(id), 

    issued_amount INTEGER NOT NULL, -- The original value of the credit (e.g., monetary value or usage units)
    remaining_amount INTEGER NOT NULL, -- Current available value of the credit
    
    -- Define if credit is monetary or unit-based. For now, assume monetary.
    -- credit_type TEXT NOT NULL DEFAULT 'monetary', -- ('monetary', 'units') 
    -- unit_type TEXT, -- If credit_type is 'units', specifies the unit (e.g., 'API_CALLS', 'GB_STORAGE')
    
    currency CHAR(3), -- If monetary, specify currency. Should match organization/subscription.

    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- Nullable, if the credit never expires

    reason TEXT, -- e.g., 'PROMO_CODE_XYZ', 'GOODWILL_REFUND', 'SERVICE_CREDIT'
    source_reference TEXT, -- e.g., ID of the promo code, refund transaction, admin user who issued
    
    status TEXT NOT NULL DEFAULT 'available', -- ('available', 'partially_used', 'fully_used', 'expired', 'voided')

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_sub_credits_subscription_id ON subscription_usage_credits(subscription_id);
CREATE INDEX idx_sub_credits_organization_id ON subscription_usage_credits(organization_id);
CREATE INDEX idx_sub_credits_usage_meter_id ON subscription_usage_credits(usage_meter_id);
CREATE INDEX idx_sub_credits_status ON subscription_usage_credits(status);
CREATE INDEX idx_sub_credits_expires_at ON subscription_usage_credits(expires_at);
```

**Zod Schema (`subscriptionUsageCredits.ts`):**
*   Define `subscriptionUsageCredits` Drizzle schema.
*   Define `subscriptionUsageCreditsInsertSchema`, `subscriptionUsageCreditsSelectSchema`, `subscriptionUsageCreditsUpdateSchema`.
*   Define client-side schemas and types.

## 2. Code Changes to Existing Files

### 2.1. `createSubscription.ts` & `createSubscription.test.ts`

*   **`createSubscriptionWorkflow` (in `createSubscription.ts`):**
    *   No immediate changes are strictly required here for creating `SubscriptionUsageMeter` or `SubscriptionUsageCredits` records *during subscription creation itself*.
    *   `SubscriptionUsageMeter` records are best created when a new *billing period* starts for relevant meters.
    *   `SubscriptionUsageCredits` are created on-demand (e.g., applying a promo code, manual grant).
*   **Tests (`createSubscription.test.ts`):**
    *   Existing tests should continue to pass. No new direct test cases related to usage meters/credits are needed *for this file's responsibilities*.

### 2.2. `billingRunHelpers.ts` & `billingRunHelpers.test.ts`

This is where the most significant changes will occur.

*   **`executeBillingRunCalculationAndBookkeepingSteps` (in `billingRunHelpers.ts`):**
    1.  **Before `calculateFeeAndTotalAmountDueForBillingPeriod`:**
        *   **Aggregate Raw Usage:** For the `billingPeriod` of the current `billingRun`:
            *   Query all `usage_events` for the `subscriptionId`, relevant `usageMeterId`(s) (derived from `billingPeriodItems` or associated prices), and the `billingPeriodId`.
            *   Sum their `amount` to get `totalRawUsageAmount` for each meter.
            *   Create or update records in `subscription_usage_meters` for the current `billingRun.billingPeriodId` with this `totalRawUsageAmount`. Set status to something like 'pending_billing'.
        *   **Fetch and Apply Credits:**
            *   Query `subscription_usage_credits` for the `subscriptionId` where `status` is 'available' or 'partially_used', and `expires_at` is null or in the future.
            *   Implement a credit application strategy (e.g., oldest first, or credits expiring soonest first; meter-specific credits before general credits).
            *   Iterate through applicable credits:
                *   Determine `amountToApplyFromCredit = min(credit.remainingAmount, current_outstanding_usage_for_meter)`.
                *   Update the `subscription_usage_credits` record:
                    *   `remainingAmount -= amountToApplyFromCredit`.
                    *   Update `status` (to 'fully_used' or 'partially_used').
                *   Update the corresponding `subscription_usage_meters` record:
                    *   `credits_applied_amount += amountToApplyFromCredit`.
                *   Keep track of the total `creditsAppliedThisPeriod` for the invoice calculation.
    2.  **Modify `calculateFeeAndTotalAmountDueForBillingPeriod` (or its inputs):**
        *   The "total due" calculation will now start from the `totalRawUsageAmount` for each item (from `SubscriptionUsageMeter` or freshly aggregated), and then the `creditsAppliedThisPeriod` (calculated above) will be subtracted to get the `netAmountDueBeforeFees`.
        *   The `FeeCalculation` process will then use this `netAmountDueBeforeFees`.
    3.  **Invoice Line Items:**
        *   Invoice line items should reflect the raw usage value.
        *   A separate line item (or a deduction section) on the invoice should show "Credits Applied" with a negative value.
    4.  **Update `SubscriptionUsageMeter`:**
        *   After successful billing (or if amount due is zero after credits), update the `subscription_usage_meters.status` to 'billed' or 'closed'.
        *   Ensure `net_billed_amount` is correctly calculated and stored.
*   **Tests (`billingRunHelpers.test.ts`):**
    *   Add tests for `calculateFeeAndTotalAmountDueForBillingPeriod` (or the new credit application logic) to verify correct calculation with various credit scenarios.
    *   Modify existing `executeBillingRun` tests to ensure:
        *   Correct aggregation into `subscription_usage_meters`.
        *   Correct application of `subscription_usage_credits`.
        *   Correct `credits_applied_amount` and `net_billed_amount` in `subscription_usage_meters`.
        *   Invoice reflects raw usage and applied credits correctly.
        *   Final `totalDueAmount` is correct after credits.
    *   Test scenarios:
        *   No credits available.
        *   Credits fully cover usage.
        *   Credits partially cover usage.
        *   Meter-specific vs. general credits.
        *   Expired credits are not applied.
        *   Credit application order (e.g., FIFO, earliest expiry).

### 2.3. `billingPeriodHelpers.ts` & `attempt-billing-period-transition.ts`

*   **`attemptToCreateFutureBillingPeriodForSubscription` (in `billingPeriodHelpers.ts`):**
    *   When a new `BillingPeriod` is created:
        *   Consider creating corresponding `SubscriptionUsageMeter` records for this new `billingPeriodId` and all active `UsageMeter`s associated with the `Subscription`. Initialize `total_raw_usage_amount`, `credits_applied_amount`, `net_billed_amount` to 0 and `status` to 'open'. This pre-populates the records for easier updates during the billing cycle.
*   **`attemptBillingPeriodClose` (in `billingPeriodHelpers.ts`):**
    *   When a billing period is closing, ensure that related `SubscriptionUsageMeter` records are also updated to a final status (e.g., 'closed', 'billed') if not already done by the billing run. This is important for periods that might not have a billing run (e.g., fully covered by credits, or zero usage).
*   **`attemptBillingPeriodTransitionTask` (in `attempt-billing-period-transition.ts`):**
    *   The call to `attemptToTransitionSubscriptionBillingPeriod` (which uses the helpers above) will implicitly include the new logic. Ensure tests cover transitions where new `SubscriptionUsageMeter` records might be created for the upcoming period.
*   **Tests:**
    *   In `billingPeriodHelpers.test.ts` (if it exists, or create one), test that new `SubscriptionUsageMeter` entries are created when a future billing period is established.
    *   Test that `attemptBillingPeriodClose` correctly finalizes `SubscriptionUsageMeter` statuses.

### 2.4. `usageEventsRouter.ts`

*   **`createUsageEvent` / `bulkInsertUsageEventsProcedure`:**
    *   No direct changes are needed to these procedures for *applying* credits in real-time. They will continue to log raw usage events.
    *   The aggregation into `SubscriptionUsageMeter` and credit application happens later, primarily during the billing run.

### 2.5. New TRPC Routers

We need new TRPC routers to manage `SubscriptionUsageCredits` and view `SubscriptionUsageMeters`.

*   **`subscriptionUsageCreditsRouter.ts`:**
    *   `create`: `usageProcedure.input(createSubscriptionUsageCreditSchema).output(...)` - Allows granting a new credit to a subscription.
        *   Input: `subscriptionId`, `issuedAmount`, `currency`, `usageMeterId` (optional), `expiresAt` (optional), `reason`, etc.
    *   `get`: `usageProcedure.input(idInputSchema).output(...)` - Fetch a specific credit.
    *   `list`: `usageProcedure.input(listSubscriptionUsageCreditsSchema).output(...)` - List credits for a subscription, with filters (e.g., status, active).
    *   `update`: `usageProcedure.input(updateSubscriptionUsageCreditSchema).output(...)` - For administrative changes (e.g., voiding a credit, changing expiry *before* use).
    *   *(Consider if a `delete` is needed, or if voiding is sufficient)*
*   **`subscriptionUsageMetersRouter.ts`:**
    *   `get`: `usageProcedure.input(getSubscriptionUsageMeterSchema).output(...)` - Fetch a specific aggregated usage meter record (e.g., by its ID or by `subscriptionId`, `usageMeterId`, `billingPeriodId`).
    *   `list`: `usageProcedure.input(listSubscriptionUsageMetersSchema).output(...)` - List aggregated usage for a subscription, potentially filterable by `usageMeterId`, `billingPeriodId` (or date range).
        *   These records are primarily populated by the billing system, so this router would be mostly for read operations.

## 3. REST API Changes

Expose the new resources and potentially enhance existing ones.

### 3.1. New REST Endpoints

*   **`POST /v1/subscription_usage_credits`**: Create a subscription usage credit.
    *   Payload: (similar to TRPC `create` input).
    *   Response: The created `SubscriptionUsageCredit` object.
*   **`GET /v1/subscription_usage_credits/{creditId}`**: Retrieve a specific credit.
    *   Response: `SubscriptionUsageCredit` object.
*   **`GET /v1/subscription_usage_credits`**: List credits.
    *   Query Params: `subscription_id` (required), `status`, `usage_meter_id`, `limit`, `starting_after`.
    *   Response: Paginated list of `SubscriptionUsageCredit` objects.
*   **`PATCH /v1/subscription_usage_credits/{creditId}`**: Update a credit (admin).
    *   Payload: Fields to update (e.g., `status: 'voided'`, `expires_at`).
    *   Response: The updated `SubscriptionUsageCredit` object.

*   **`GET /v1/subscription_usage_meters/{subUsageMeterId}`**: Retrieve a specific aggregated usage meter record.
    *   Response: `SubscriptionUsageMeter` object.
*   **`GET /v1/subscription_usage_meters`**: List aggregated usage meter records.
    *   Query Params: `subscription_id` (required), `usage_meter_id`, `billing_period_id`, `date_from`, `date_to`, `limit`, `starting_after`.
    *   Response: Paginated list of `SubscriptionUsageMeter` objects.

### 3.2. Changes to Existing Subscription Object (`GET /v1/subscriptions/{subId}`)

*   **Should it have a `subscriptionUsageMeters` object/array?**
    *   **Option 1 (Summary):** Include a summary for the *current* billing period.
        ```json
        // Inside Subscription object
        "current_period_usage_summary": [
            {
                "usage_meter_id": "meter_abc",
                "usage_meter_name": "API Calls",
                "total_raw_usage_amount": 10000,
                "credits_applied_amount": 500, // Monetary value if credits are monetary
                "net_billed_amount": 9500 // Reflects what's billed for this meter
            }
        ]
        ```
    *   **Option 2 (Full List - Not Recommended for Default):** Embedding a full historical list of `SubscriptionUsageMeter` objects would make the subscription object too large. Prefer dedicated endpoints.
    *   **Recommendation:** Stick to dedicated endpoints (`GET /v1/subscription_usage_meters?subscription_id=...`) for detailed historical data. Maybe include a summary of the *current* billing period's usage meters if highly valuable for immediate display.

*   **Do we need to expose `subscriptionUsageCredits` on the subscription object we return?**
    *   **Option 1 (Summary):** Include a summary of *available* credits.
        ```json
        // Inside Subscription object
        "available_credits_summary": {
            "total_remaining_monetary_value": 50.00, // Sum of remaining_amount for all active, non-expired monetary credits
            "currency": "USD",
            // Potentially a count of active credits or breakdown by type if complex
        }
        ```
    *   **Option 2 (Full List - Not Recommended):** Again, embedding a full list can be problematic.
    *   **Recommendation:** A summary of available credits is useful. For detailed credit information, use the dedicated `GET /v1/subscription_usage_credits?subscription_id=...` endpoint.

## 4. Test Coverage

### 4.1. Regression Tests (Ensuring We Don't Break Existing Functionality)

*   **`createSubscription.test.ts`:** All existing tests should pass without modification, as the core subscription creation logic isn't directly adding usage meters or credits at that stage.
*   **`billingRunHelpers.test.ts`:**
    *   Existing tests for billing runs *without* credits should still produce the same raw invoice amounts, but the final `totalDueAmount` might differ if we introduce a step that *always* checks for credits (even if none exist). Adapt assertions accordingly.
    *   Ensure calculations for scenarios without any credit system interference remain correct.
*   **`billingPeriodHelpers.test.ts`:** Tests for billing period transitions and creation should largely remain the same, with the addition of verifying `SubscriptionUsageMeter` placeholder creation if implemented.

### 4.2. New Functionality Tests

*   **`subscriptionUsageCredits.ts` (Schema and DB methods):**
    *   Unit tests for Zod schemas.
    *   Integration tests for `insertSubscriptionUsageCredit`, `selectSubscriptionUsageCredits`, `updateSubscriptionUsageCredit`.
*   **`subscriptionUsageMeters.ts` (Schema and DB methods):**
    *   Unit tests for Zod schemas.
    *   Integration tests for DB methods (if any beyond what's driven by billing run).
*   **`billingRunHelpers.test.ts` (New Tests):**
    *   **Credit Application Logic:**
        *   Test billing run with no credits: `netAmountDue` should equal `rawUsageAmount`.
        *   Test credits fully covering usage: `netAmountDue` should be 0.
        *   Test credits partially covering usage.
        *   Test meter-specific credits applying only to their designated meter.
        *   Test general credits applying after meter-specific ones (or per chosen strategy).
        *   Test credit application order (e.g., FIFO, earliest expiry).
        *   Test expired credits are ignored.
        *   Test credits with `remainingAmount` being correctly reduced and status updated ('partially_used', 'fully_used').
        *   Test scenario with multiple small credits being consumed for one large usage charge.
    *   **`SubscriptionUsageMeter` Population:**
        *   Verify `SubscriptionUsageMeter` records are created/updated correctly during the billing run with `total_raw_usage_amount`, `credits_applied_amount`, and `net_billed_amount`.
        *   Verify status updates on `SubscriptionUsageMeter` records.
    *   **Invoice Generation:**
        *   Verify invoice line items show raw amounts.
        *   Verify invoice has a clear indication of "Credits Applied" (e.g., as a negative line item or a total deduction).
*   **`billingPeriodHelpers.test.ts` (New Tests):**
    *   If `SubscriptionUsageMeter` records are pre-created for new billing periods, test this creation.
    *   Test `attemptBillingPeriodClose` correctly finalizes `SubscriptionUsageMeter` statuses.
*   **TRPC Routers (e.g., `subscriptionUsageCreditsRouter.test.ts`, `subscriptionUsageMetersRouter.test.ts`):**
    *   Test `create`, `get`, `list`, `update` procedures for `SubscriptionUsageCredits`.
    *   Test `get`, `list` procedures for `SubscriptionUsageMeters`.
    *   Validate input schemas and output transformations.
    *   Test authentication/authorization.
*   **Periodic Credit Expiration Job (if implemented):**
    *   Test that a background job correctly identifies and marks expired `SubscriptionUsageCredits` records.

This game plan provides a comprehensive overview. We can break down the implementation into smaller, manageable PRs, starting with the database schema, then core billing logic, followed by TRPC/REST APIs, and finally UI changes if any.
