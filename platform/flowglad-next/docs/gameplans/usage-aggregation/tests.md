# Comprehensive Testing Strategy for Usage Aggregation & Subscription Ledger

This document outlines a comprehensive testing strategy for the usage aggregation and subscription ledger system, as designed in `gameplans/usage-aggregation.md`. The goal is to ensure correctness, resilience, and auditability of all financial data and operations.

## I. Core Ledger & System-Wide Properties (The Foundation)

These tests ensure the fundamental integrity and reliability of the ledger system itself.

1.  **Balance Integrity & Accuracy:**
    *   **Test:** At any point, the sum of all `amount` fields in `LedgerEntries` where `status = 'posted'`, OR (`status = 'pending' AND discarded_at IS NULL`) for a given subscription must accurately reflect its current effective financial balance. Distinguish tests for purely "posted balance" vs. "balance including pending."
    *   **Why:** This is the single most crucial check of a ledger.

2.  **Immutability & Lifecycle of Ledger Items:**
    *   **Test:** Once a `LedgerEntry` has `status = 'posted'`, its core financial fields (`amount`, `currency`, `entry_type`, `status`, `usage_transaction_id`, source links) cannot be altered, and `discarded_at` must remain `NULL`. Updates should only affect non-critical metadata or system timestamps like `updated_at` on the record (if applicable, though ledger items are often fully immutable once written, even `updated_at`).
    *   **Test:** `LedgerEntries` with `status = 'pending'` can have `discarded_at` set to a timestamp. Once `discarded_at` is set, the item is considered non-active and its `status` should remain `'pending'` (or a new dedicated status like `'discarded'` could be introduced if preferred, though `pending` + `discarded_at IS NOT NULL` is common).
    *   **Test:** A `discarded_at` item cannot be transitioned to `'posted'`.
    *   **Test:** All `LedgerEntries` MUST have a valid `usage_transaction_id` linking to an existing `LedgerTransaction`.
    *   **Why:** Ensures data integrity, auditability, and correct lifecycle management.

3.  **Atomicity of Operations:**
    *   **Test:** Any operation that results in multiple database records (e.g., a payment creating a `UsageCredits` grant AND a `LedgerEntry`) must be atomic. Either all records are created successfully, or none are (transaction rollback).
    *   **Why:** Prevents inconsistent states and orphaned records.

4.  **Idempotency of Event Ingestion & Processing:**
    *   **Test:** Processing the same external event multiple times (e.g., a usage event webhook, a payment confirmation webhook) should result in the same financial outcome as processing it once. No duplicate charges, credits, or grants.
    *   **Why:** Essential for resilience against network issues or retries from external systems.

5.  **Traceability & Referential Integrity:**
    *   **Test:** Every `LedgerEntry` must have valid foreign keys pointing to its originating backing parent record(s) (e.g., `source_usage_event_id`, `source_usage_credit_id`, etc.). No orphaned ledger items.
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
    *   **Test:** Simulate near-simultaneous conflicting operations on the same subscription (e.g., applying a credit which creates `pending` items, while another process attempts to finalize/post items for a run, or one process discards a pending item while another tries to post it). Ensure predictable, correct outcomes and no deadlocks or race conditions regarding `status` changes and `discarded_at` updates.
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

12. **Source Record Linkage & Traceability:**
    *   **Test:** Every `LedgerEntry` must be correctly linked to its originating source record(s) (e.g., `source_usage_event_id`, `source_payment_id`, `source_usage_credit_id`, `source_credit_application_id`, etc.) based on its `entry_type`.
    *   **Test:** Every `LedgerEntry` must belong to a `LedgerTransaction` that accurately reflects the conceptual business operation that generated the item(s).
    *   **Test:** For a given `LedgerTransaction`, all its associated `LedgerEntries` should logically belong to the same overarching event (e.g., all items for one payment confirmation, all items for one admin adjustment).
    *   **Why:** Critical for auditability and understanding the context of each financial event.

## II. Specific Use Cases & Flow Testing (Our System's Logic)

These tests cover the end-to-end financial logic as defined in `gameplans/usage-aggregation.md`.

**A. Usage & Cost Accrual:**
1.  Single `UsageEvent` -> Correct `usage_cost` `LedgerEntry` (negative amount, correct pricing, correct initial `status` - e.g., `'posted'` if immediately final, or `'pending'` if part of a batch to be finalized).
2.  Multiple `UsageEvents` (same/different meters, same/different billing periods) -> Correct set of `usage_cost` ledger items with appropriate statuses.
3.  `UsageEvent` with complex pricing rules (if applicable) -> Correct cost calculation reflected in ledger item.

**B. Payments & Credit Granting (Initial Funding):**
4.  Successful `Payment` (PAYG) -> `UsageCredits` grant created -> `payment_recognized` `LedgerEntry` (positive, `status = 'posted'`).
5.  Successful `Payment` (Invoice Settlement) -> `UsageCredits` grant created -> `payment_recognized` ledger item (`status = 'posted'`).
6.  Failed `Payment` -> No `UsageCredits` grant, no `payment_recognized` ledger item.
7.  Payment confirmation arrives *after* related usage -> Order of operations handled correctly, ledger items reflect final state.

**C. Non-Payment Credit Granting (Promos, Goodwill):**
8.  Admin/System grants promo credit -> `UsageCredits` grant created -> `credit_grant_recognized` `LedgerEntry` (positive, `status = 'posted'`).
9.  Credit grant with an `expires_at` date.
10. Credit grant scoped to a specific `billing_period_id` or `usage_meter_id`.

**D. Credit Application (The Core Consumption Logic):**
11. **Sufficient Credit & Lifecycle:**
    *   Single grant fully covers a single `usage_cost`.
    *   Single grant partially covers a `usage_cost`.
    *   Multiple grants combine to cover `usage_cost`(s).
    *   Credit application results in:
        *   Correct `UsageCreditApplications` record(s).
        *   Correct `credit_applied_to_usage` `LedgerEntry`(s) (positive, offsetting cost), initially created with `status = 'pending'`.
        *   Test scenarios where credit application logic iterates within a run: existing `pending` items are correctly marked `discarded_at`, and new `pending` items are created.
        *   Test that at the end of the operational context (e.g., billing run), all non-discarded `pending` items are transitioned to `status = 'posted'`.
        *   Test that `discarded_at` items are NOT transitioned to `posted`.
12. **Insufficient Credit:**
    *   All available credit applied (as `pending` items, then `posted`), remaining `usage_cost` leads to a net debit balance.
13. **Credit Application Rules (if any):**
    *   Test ordering: e.g., oldest credits first, meter-specific before general, period-specific before evergreen.
14. **No Credit Available:**
    *   `usage_cost` directly impacts balance, no credit application occurs.

**E. Credit Expiration:**
15. Fully unused `UsageCredits` grant expires -> `credit_grant_expired` `LedgerEntry` (negative, for full issued amount, `status = 'posted'`).
16. Partially used grant expires -> `credit_grant_expired` ledger item for the *correct remaining unused portion* (`status = 'posted'`). (Requires checking `UsageCreditApplications` and their ledger items, considering only `posted` or non-discarded `pending` applications).
17. Grant is fully used *before* `expires_at` (all applications `posted` or finalized as `posted`) -> No `credit_grant_expired` ledger item created.
18. Batch job for expirations correctly identifies and processes all eligible expired credits, creating `posted` ledger items.

**F. Administrative Adjustments (Clawbacks, Corrections):**
19. Admin reduces an *unspent* `UsageCredits` grant -> `UsageCreditBalanceAdjustments` record -> `credit_balance_adjusted` `LedgerEntry` (negative, `status = 'posted'`).
20. Admin attempts to reduce a grant by *more than its unspent value* (expected behavior: fail or cap at unspent value based on active ledger effects).
21. Admin adjusts a *partially spent* grant (effects are on already `posted` ledger items, so this adjustment is a new `posted` item).

**G. Refunds:**
22. Full refund for a `Payment` whose credit is *unused*:
    *   `Refunds` record created.
    *   `payment_refunded` `LedgerEntry` (negative, `status = 'posted'`).
    *   (Optional secondary effect): Test if corresponding `UsageCredits` grant is also adjusted/invalidated via `UsageCreditBalanceAdjustments`.
23. Partial refund for a `Payment`.
24. Refund for a `Payment` whose credit was *already fully or partially spent*:
    *   `Refunds` record, `payment_refunded` ledger item.
    *   Subscription balance correctly reflects the deficit (may go negative).
25. Refund for a payment that originally failed (should not be possible or should be handled gracefully).
26. Refund status updates (`pending` -> `succeeded`/`failed`) correctly trigger or halt `posted` ledger item creation.

**H. Billing Period Calculations & Snapshots (`SubscriptionMeterPeriodCalculations`):**
27. `SubscriptionMeterPeriodCalculations` record correctly aggregates `total_raw_usage_amount`, `credits_applied_amount`, and `net_billed_amount` from relevant `LedgerEntries` for the period and meter (considering only items that are `posted` by the end of the calculation run).
28. Correct handling of `active` vs. `superseded` calculation records when a period is recalculated/adjusted.
29. Correct linkage of calculation records to source `Invoice` or `CreditNote` IDs.

**I. Edge Cases & Complex Interactions:**
30. Subscription creation/cancellation: Ensure ledger behaves correctly (e.g., final settlement with `posted` items, expiration of remaining credits if applicable).
31. Multiple operations on the same subscription in rapid succession or within the same billing run (e.g., usage, payment, credit application with `pending` items, new grant, finalization to `posted`).
32. Zero-value `UsageEvents` or `UsageCredits` grants (how are they handled regarding ledger item creation and status?).
33. Leap years / time zone changes affecting `expires_at` or `billing_period` logic.

## III. Unit & Integration Testing Focus for Ledgers (General Best Practices)

*   **Unit Tests:**
    *   Functions creating/validating each backing parent record type.
    *   Functions creating/validating `LedgerEntries` (correct `entry_type`, sign of `amount`, all FKs populated, correct initial `status`, handling of `discarded_at`).
    *   Logic for transitioning `LedgerEntry.status` from `pending` to `posted`.
    *   Logic for setting `LedgerEntry.discarded_at`.
    *   Pricing logic functions.
    *   Credit selection/application logic functions (if complex, e.g., which grant to pick).
    *   Functions calculating remaining value on a `UsageCredits` grant.
    *   Functions deriving balances from `LedgerEntries` (correctly filtering by `status` and `discarded_at IS NULL`).
    *   Validation rules for Zod schemas, including `status` and `discarded_at` interdependencies.
*   **Integration Tests:**
    *   **End-to-End Flow Tests:** Each numbered use case in Section II should be an integration test, verifying the full lifecycle of `LedgerEntries` including `pending`, `discarded_at` (if applicable to the flow), and `posted` states.
    *   **Database Transaction Management:** Verify that operations involving multiple inserts/updates, including status changes and setting `discarded_at`, are correctly committed or rolled back.
    *   **Service Interactions (if applicable):** Test interactions with other internal services if the ledger system is part of a larger microservices architecture.
    *   **API Layer (if applicable):** If the ledger operations are exposed via an API, test the API endpoints for creating events that trigger ledger entries.
    *   **Query Logic:** Test complex queries used for reporting, balance calculation (differentiating posted vs. pending balances), or identifying records for processing (e.g., finding non-discarded `pending` items for a given `calculation_run_id` to transition them to `posted`).

*   **Tables to Test:** `UsageCredits`, `UsageCreditApplications`, `UsageCreditBalanceAdjustments`, `Refunds`, `LedgerEntries`, `SubscriptionMeterPeriodCalculations`, `LedgerTransactions`.
*   **Key Scenarios:**
    *   Creating each type of parent record (e.g., `UsageCredits`, `Refunds`).
    *   Creating a `LedgerTransaction` for each conceptual operation.
    *   Creating `LedgerEntries` linked to the correct `LedgerTransaction` and source records, with correct `entry_type`, `status`, `amount`, `currency`.
    *   Lifecycle of `LedgerEntries`: `pending` -> `discarded_at` (if applicable) -> `posted`.

7.  **Billing Run Simulation (`billingRunHelpers.ts`):**
    *   **Test:** Simulate a full billing run for a subscription with various usage events and applicable credits (some that expire, some that are fully used, some partially used).
    *   Verify that a `LedgerTransaction` is created for the credit application phase.
    *   Verify that `UsageCreditApplications` records are created correctly.
    *   Verify that `LedgerEntries` with `entry_type='credit_applied_to_usage'` are created with `status='pending'` and linked to the correct `LedgerTransaction` and `calculation_run_id`.
    *   Verify that if the logic re-evaluates credit application within the same run, appropriate `pending` items are marked `discarded_at` and new `pending` items (linked to the same `LedgerTransaction` and `calculation_run_id`) supersede them.
    *   Verify that at the end of the run, all non-discarded `pending` ledger items are transitioned to `status='posted'`.
    *   Verify correct creation/update of `SubscriptionMeterPeriodCalculations` based on the sum of `posted` ledger items for the run.
