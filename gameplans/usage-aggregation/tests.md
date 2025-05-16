# Comprehensive Testing Strategy for Usage Aggregation & Subscription Ledger

This document outlines a comprehensive testing strategy for the usage aggregation and subscription ledger system, as designed in `gameplans/usage-aggregation.md`. The goal is to ensure correctness, resilience, and auditability of all financial data and operations.

## I. Core Ledger & System-Wide Properties (The Foundation)

These tests ensure the fundamental integrity and reliability of the ledger system itself.

1.  **Balance Integrity & Accuracy:**
    *   **Test:** At any point, the sum of all `amount` fields in `SubscriptionLedgerItems` for a given subscription must accurately reflect its current financial balance.
    *   **Why:** This is the single most crucial check of a ledger.

2.  **Immutability:**
    *   **Test:** Once created, core financial fields in `SubscriptionLedgerItems` and all backing parent records (`UsageEvents`, `Payments` (once terminal), `SubscriptionCredits`, `CreditBalanceAdjustments`, `SubscriptionCreditApplications`, `Refunds` (once terminal)) cannot be altered. Updates should only affect non-critical metadata or system timestamps like `updated_at`.
    *   **Why:** Ensures auditability and prevents silent data corruption.

3.  **Atomicity of Operations:**
    *   **Test:** Any operation that results in multiple database records (e.g., a payment creating a `SubscriptionCredits` grant AND a `SubscriptionLedgerItem`) must be atomic. Either all records are created successfully, or none are (transaction rollback).
    *   **Why:** Prevents inconsistent states and orphaned records.

4.  **Idempotency of Event Ingestion & Processing:**
    *   **Test:** Processing the same external event multiple times (e.g., a usage event webhook, a payment confirmation webhook) should result in the same financial outcome as processing it once. No duplicate charges, credits, or grants.
    *   **Why:** Essential for resilience against network issues or retries from external systems.

5.  **Traceability & Referential Integrity:**
    *   **Test:** Every `SubscriptionLedgerItem` must have valid foreign keys pointing to its originating backing parent record(s) (e.g., `source_usage_event_id`, `source_subscription_credit_id`, etc.). No orphaned ledger items.
    *   **Test:** Conversely, ensure no orphaned backing records that *should* have resulted in ledger activity but didn't.
    *   **Why:** Guarantees a complete audit trail and data consistency.

6.  **Currency Consistency:**
    *   **Test:** All financial amounts within a related set of transactions (e.g., a payment, the credit it grants, the ledger items it creates) must use the same currency. Operations involving multiple currencies must be explicitly handled and tested if supported.
    *   **Why:** Prevents financial miscalculations.

7.  **Performance & Scalability (Stress Tests):**
    *   **Test:** Simulate high volumes of incoming events (usage, payments) and ledger entry creation. Measure write performance.
    *   **Test:** Simulate frequent balance queries for many subscriptions. Measure read performance.
    *   **Why:** Ensures the system can handle production load without degradation.

8.  **Concurrency Control:**
    *   **Test:** Simulate near-simultaneous conflicting operations on the same subscription (e.g., applying a credit while a refund for the funding payment is processed). Ensure predictable, correct outcomes and no deadlocks or race conditions.
    *   **Why:** Maintains data integrity in a multi-threaded or distributed environment.

9.  **Data Integrity Under Failure Scenarios:**
    *   **Test:** Simulate system crashes or database connection failures during multi-step operations. Verify that transactions are rolled back correctly and the system recovers to a consistent state.
    *   **Why:** Ensures resilience and data safety.

10. **Archival & Purging (Long-term consideration):**
    *   **Test:** If data archival/purging strategies are implemented, ensure they don't break historical balance calculations or audit trails for active/relevant entities.
    *   **Why:** Manages data growth while preserving necessary history.

11. **Resilience to Schema Evolution / Versioning:**
    *   **Test (Mental Exercise/Forward Planning):** How would the system handle reading or interacting with ledger items or backing records created by a *previous version* of the code if a non-backward-compatible schema change is made? Plan for data migrations or tolerant read patterns.
    *   **Why:** Ensures long-term maintainability and avoids breaking old data when the system evolves. Artifacts from past versions should still be interpretable correctly.

## II. Specific Use Cases & Flow Testing (Our System's Logic)

These tests cover the end-to-end financial logic as defined in `gameplans/usage-aggregation.md`.

**A. Usage & Cost Accrual:**
1.  Single `UsageEvent` -> Correct `usage_cost` `SubscriptionLedgerItem` (negative amount, correct pricing).
2.  Multiple `UsageEvents` (same/different meters, same/different billing periods) -> Correct set of `usage_cost` ledger items.
3.  `UsageEvent` with complex pricing rules (if applicable) -> Correct cost calculation.

**B. Payments & Credit Granting (Initial Funding):**
4.  Successful `Payment` (PAYG) -> `SubscriptionCredits` grant created (`credit_type: 'payment_top_up'`, `initial_status: 'granted_active'`) -> `payment_recognized` `SubscriptionLedgerItem` (positive).
5.  Successful `Payment` (Invoice Settlement) -> `SubscriptionCredits` grant created (`credit_type: 'payment_period_settlement'`) -> `payment_recognized` ledger item.
6.  Failed `Payment` -> No `SubscriptionCredits` grant, no `payment_recognized` ledger item.
7.  Payment confirmation arrives *after* related usage -> Order of operations handled correctly.

**C. Non-Payment Credit Granting (Promos, Goodwill):**
8.  Admin/System grants promo credit -> `SubscriptionCredits` grant created (`credit_type: 'granted_promo'`) -> `credit_grant_recognized` `SubscriptionLedgerItem` (positive).
9.  Credit grant with an `expires_at` date.
10. Credit grant scoped to a specific `billing_period_id` or `usage_meter_id`.

**D. Credit Application (The Core Consumption Logic):**
11. **Sufficient Credit:**
    *   Single grant fully covers a single `usage_cost`.
    *   Single grant partially covers a `usage_cost`.
    *   Multiple grants combine to cover `usage_cost`(s).
    *   Credit application results in:
        *   Correct `SubscriptionCreditApplications` record(s).
        *   Correct `credit_applied_to_usage` `SubscriptionLedgerItem`(s) (positive, offsetting cost).
12. **Insufficient Credit:**
    *   All available credit applied, remaining `usage_cost` leads to a net debit balance.
13. **Credit Application Rules (if any):**
    *   Test ordering: e.g., oldest credits first, meter-specific before general, period-specific before evergreen.
14. **No Credit Available:**
    *   `usage_cost` directly impacts balance, no credit application occurs.

**E. Credit Expiration:**
15. Fully unused `SubscriptionCredits` grant expires -> `credit_grant_expired` `SubscriptionLedgerItem` (negative, for full issued amount).
16. Partially used grant expires -> `credit_grant_expired` ledger item for the *correct remaining unused portion*. (Requires checking `SubscriptionCreditApplications`).
17. Grant is fully used *before* `expires_at` -> No `credit_grant_expired` ledger item created.
18. Batch job for expirations correctly identifies and processes all eligible expired credits for a given day.

**F. Administrative Adjustments (Clawbacks, Corrections):**
19. Admin reduces an *unspent* `SubscriptionCredits` grant -> `CreditBalanceAdjustments` record -> `credit_balance_adjusted` `SubscriptionLedgerItem` (negative).
20. Admin attempts to reduce a grant by *more than its unspent value* (expected behavior: fail or cap at unspent value).
21. Admin adjusts a *partially spent* grant.

**G. Refunds:**
22. Full refund for a `Payment` whose credit is *unused*:
    *   `Refunds` record created.
    *   `payment_refunded` `SubscriptionLedgerItem` (negative).
    *   (Optional secondary effect): Test if corresponding `SubscriptionCredits` grant is also adjusted/invalidated via `CreditBalanceAdjustments`.
23. Partial refund for a `Payment`.
24. Refund for a `Payment` whose credit was *already fully or partially spent*:
    *   `Refunds` record, `payment_refunded` ledger item.
    *   Subscription balance correctly reflects the deficit (may go negative).
25. Refund for a payment that originally failed (should not be possible or should be handled gracefully).
26. Refund status updates (`pending` -> `succeeded`/`failed`) correctly trigger or halt ledger posting.

**H. Billing Period Calculations & Snapshots (`SubscriptionMeterPeriodCalculations`):**
27. `SubscriptionMeterPeriodCalculations` record correctly aggregates `total_raw_usage_amount`, `credits_applied_amount`, and `net_billed_amount` from relevant `SubscriptionLedgerItems` for the period and meter.
28. Correct handling of `active` vs. `superseded` calculation records when a period is recalculated/adjusted.
29. Correct linkage of calculation records to source `Invoice` or `CreditNote` IDs.

**I. Edge Cases & Complex Interactions:**
30. Subscription creation/cancellation: Ensure ledger behaves correctly (e.g., final settlement, expiration of remaining credits if applicable).
31. Multiple operations on the same subscription in rapid succession or within the same billing run (e.g., usage, payment, credit application, new grant).
32. Zero-value `UsageEvents` or `SubscriptionCredits` grants (how are they handled?).
33. Leap years / time zone changes affecting `expires_at` or `billing_period` logic.

## III. Unit & Integration Testing Focus for Ledgers (General Best Practices)

*   **Unit Tests:**
    *   Functions creating/validating each backing parent record type.
    *   Functions creating/validating `SubscriptionLedgerItems` (correct `entry_type`, sign of `amount`, all FKs populated).
    *   Pricing logic functions.
    *   Credit selection/application logic functions (if complex, e.g., which grant to pick).
    *   Functions calculating remaining value on a `SubscriptionCredits` grant.
    *   Functions deriving balances from `SubscriptionLedgerItems`.
    *   Validation rules for Zod schemas.
*   **Integration Tests:**
    *   **End-to-End Flow Tests:** Each numbered use case in Section II should be an integration test, mocking external dependencies (like payment gateways) but using a real test database.
    *   **Database Transaction Management:** Verify that operations involving multiple inserts/updates are correctly committed or rolled back as a single transaction. Test database constraints.
    *   **Service Interactions (if applicable):** Test interactions with other internal services if the ledger system is part of a larger microservices architecture.
    *   **API Layer (if applicable):** If the ledger operations are exposed via an API, test the API endpoints for creating events that trigger ledger entries.
    *   **Query Logic:** Test complex queries used for reporting, balance calculation, or identifying records for processing (e.g., finding expired credits).
