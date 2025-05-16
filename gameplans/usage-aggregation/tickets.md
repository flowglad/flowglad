------
## 1. Implement `usage_credits` Table and Schema

### Background
Currently, we lack a dedicated, immutable record for each instance of a credit grant (e.g., from payments, promotions).

This is a problem because it's difficult to trace the origin and initial terms of credits, and to manage their lifecycle independently of their application.

To solve this, let's introduce the `usage_credits` table to store records of distinct credit grants or funding events. Once created, these records will be immutable regarding their `issued_amount` and core details.

### Changes
- **SQL Migration:** Define and create the `usage_credits` table as specified in `product-spec.md` (Section 1.1).
  - Key fields: `id`, `subscription_id`, `organization_id`, `livemode`, `credit_type`, `source_reference_id`, `billing_period_id`, `usage_meter_id`, `issued_amount`, `currency`, `issued_at`, `expires_at`, `initial_status`, `notes`, `metadata`.
- **`@/db/schema/usageCredits.ts`:** Create the Drizzle Zod schema for the `usage_credits` table, reflecting the table structure and ensuring core financial fields are treated as immutable post-creation.

### Acceptance Criteria
- The `usage_credits` table exists in the database with the correct schema and indexes.
- The Drizzle Zod schema `usageCredits` is defined, accurately reflects the table, and can be used for validation and type inference.
- Core fields like `issued_amount` are conceptually immutable in the Zod schema/application logic handling.

### Test Coverage
- Unit tests for Zod schema validation (e.g., correct types, required fields).
- Integration tests to verify table creation and basic CRUD operations (though updates to core financial fields should be disallowed by application logic).

------
## 2. Implement `usage_credit_balance_adjustments` Table and Schema

### Background
Currently, there is no structured way to record administrative actions that change the effective value of a previously granted credit (e.g., clawbacks, corrections).

This is a problem because it leads to a lack of auditability for why a credit's usable value might differ from its originally issued amount.

To solve this, let's introduce the `usage_credit_balance_adjustments` table to record explicit administrative actions to change the effective value of a `usage_credits` grant.

### Changes
- **SQL Migration:** Define and create the `usage_credit_balance_adjustments` table as specified in `product-spec.md` (Section 1.2).
  - Key fields: `id`, `adjusted_usage_credit_id`, `adjustment_type`, `amount_adjusted`, `currency`, `reason`, `adjusted_by_user_id`, `adjustment_initiated_at`, `notes`, `metadata`, `organization_id`, `livemode`.
- **`@/db/schema/usageCreditBalanceAdjustments.ts`:** Create the Drizzle Zod schema for the `usage_credit_balance_adjustments` table.

### Acceptance Criteria
- The `usage_credit_balance_adjustments` table exists in the database with the correct schema and indexes.
- The Drizzle Zod schema `usageCreditBalanceAdjustments` is defined and accurately reflects the table.
- Core fields defining the adjustment are conceptually immutable post-creation.

### Test Coverage
- Unit tests for Zod schema validation.
- Integration tests for table creation and basic CRUD operations.

------
## 3. Implement `usage_credit_applications` Table and Schema

### Background
Currently, we do not have a dedicated table to immutably record each instance where a portion of a credit grant is applied to offset usage costs.

This is a problem because it's hard to get an itemized breakdown of how and when specific credit grants were utilized, making auditing difficult.

To solve this, let's introduce the `usage_credit_applications` table to store an immutable record for each instance a `UsageCredits` grant is applied.

### Changes
- **SQL Migration:** Define and create the `usage_credit_applications` table as specified in `product-spec.md` (Section 1.3).
  - Key fields: `id`, `usage_credit_id`, `calculation_run_id`, `amount_applied`, `currency`, `applied_at`, `target_usage_meter_id`, `organization_id`, `livemode`.
- **`@/db/schema/usageCreditApplications.ts`:** Create the Drizzle Zod schema for the `usage_credit_applications` table.

### Acceptance Criteria
- The `usage_credit_applications` table exists in the database with the correct schema and indexes.
- The Drizzle Zod schema `usageCreditApplications` is defined and accurately reflects the table.
- All fields are conceptually immutable post-creation.

### Test Coverage
- Unit tests for Zod schema validation.
- Integration tests for table creation and ensuring records can be created.

------
## 4. Implement `refunds` Table and Schema

### Background
Currently, while payments are tracked, the process and record-keeping for refunds, especially as a backing event for financial ledger entries, is not explicitly defined in the new system.

This is a problem because refunds are significant financial events that need their own immutable source record to ensure ledger traceability and accurate accounting.

To solve this, let's introduce the `refunds` table to serve as the "backing parent record" for ledger entries related to payment refunds.

### Changes
- **SQL Migration:** Define and create the `refunds` table as specified in `product-spec.md` (Section 1.4).
  - Key fields: `id`, `payment_id`, `subscription_id`, `organization_id`, `livemode`, `amount`, `currency`, `reason`, `status`, `refund_processed_at`, `gateway_refund_id`, `notes`, `initiated_by_user_id`.
- **`@/db/schema/refunds.ts`:** Create the Drizzle Zod schema for the `refunds` table, noting fields that become immutable once the refund reaches a terminal status.

### Acceptance Criteria
- The `refunds` table exists in the database with the correct schema and indexes.
- The Drizzle Zod schema `refunds` is defined and accurately reflects the table.
- Core financial fields are immutable once the refund status is 'succeeded' or 'failed'.

### Test Coverage
- Unit tests for Zod schema validation.
- Integration tests for table creation and simulating status transitions.

------
## 5. Implement `usage_ledger_items` Table and Schema

### Background
Currently, we lack a centralized, immutable, append-only journal for all financial events and value movements for a subscription.

This is a problem because it's difficult to get a complete, auditable financial history for a subscription, and to reliably calculate balances or trace financial outcomes.

To solve this, let's introduce the `usage_ledger_items` table as the grand financial journal. Every entry must be traceable to a source event/record.

### Changes
- **SQL Migration:** Define and create the `usage_ledger_items` table as specified in `product-spec.md` (Section 1.5).
  - Key fields: `id`, `subscription_id`, `entry_timestamp`, `entry_type`, `amount`, `currency`, `description`, various `source_..._id` fields (including `source_usage_credit_id`, `source_credit_application_id`, `source_credit_balance_adjustment_id`), `applied_to_ledger_item_id`, `billing_period_id`, `usage_meter_id`, `calculation_run_id`, `metadata`, `organization_id`, `livemode`.
- **`@/db/schema/usageLedgerItems.ts`:** Create the Drizzle Zod schema for the `usage_ledger_items` table, including conditional validation for `source_..._id` fields based on `entry_type`.

### Acceptance Criteria
- The `usage_ledger_items` table exists in the database with the correct schema and comprehensive indexing.
- The Drizzle Zod schema `usageLedgerItems` is defined, accurately reflects the table, and enforces conditional source ID requirements.
- All fields are conceptually immutable post-creation.

### Test Coverage
- Unit tests for Zod schema validation, especially conditional logic.
- Integration tests for table creation and ensuring records can be created with various entry types.

------
## 6. Implement `subscription_meter_period_calculations` Table and Schema

### Background
Currently, there's no system to store immutable snapshots of the outcomes of billing calculations for each usage meter within a subscription's billing period.

This is a problem because it's hard to track historical calculation results, manage recalculations, and provide a clear basis for invoices or credit notes.

To solve this, let's introduce the `subscription_meter_period_calculations` table to store an immutable snapshot for each time a calculation is performed and finalized.

### Changes
- **SQL Migration:** Define and create the `subscription_meter_period_calculations` table as specified in `product-spec.md` (Section 1.6).
  - Key fields: `id`, `calculation_run_id` (UNIQUE), `subscription_id`, `usage_meter_id`, `billing_period_id`, `calculated_at`, `calculation_type`, `total_raw_usage_amount`, `credits_applied_amount`, `net_billed_amount`, `status`, `superseded_by_calculation_id`, `source_invoice_id`, `source_credit_note_id`, `notes`.
  - Includes `UNIQUE` constraint for active calculations.
- **`@/db/schema/subscriptionMeterPeriodCalculations.ts`:** Create the Drizzle Zod schema for the `subscription_meter_period_calculations` table.

### Acceptance Criteria
- The `subscription_meter_period_calculations` table exists with the correct schema, indexes, and unique constraint.
- The Drizzle Zod schema `subscriptionMeterPeriodCalculations` is defined and accurately reflects the table.
- Core calculation result fields are immutable once active; status changes are managed.

### Test Coverage
- Unit tests for Zod schema validation.
- Integration tests for table creation, unique constraint enforcement, and status transition logic.

------
## 7. Integrate Usage Event Ingestion with Ledger

### Background
Currently, ingested usage events are not processed to create corresponding financial records in the new ledger system.

This is a problem because usage, which forms the basis of charges, is not being recorded as a cost in the auditable financial journal.

To solve this, let's modify the usage event ingestion process to create a `UsageLedgerItem` of type `'usage_cost'` for each validated usage event.

### Changes
- **Usage Ingestion Service (e.g., `@/services/usageEvents/ingestion.ts`):**
  - After a `UsageEvent` is successfully ingested and validated, and its cost calculated:
    - Create one `UsageLedgerItem` record.
    - `entry_type`: `'usage_cost'`
    - `amount`: Negative value representing the calculated cost.
    - `source_usage_event_id`: The `id` of the `UsageEvent`.
    - Populate other relevant fields: `subscription_id`, `organization_id`, `livemode`, `billing_period_id` (if applicable), `usage_meter_id`, `currency`, `description`.
  - Ensure this operation occurs within a database transaction along with the usage event saving if applicable.

### Acceptance Criteria
- For every valid usage event processed, a corresponding `UsageLedgerItem` with `entry_type = 'usage_cost'` is created.
- The ledger item accurately reflects the cost, currency, and source usage event.
- All necessary fields on the ledger item are populated.
- The operation is atomic.

### Test Coverage
- Unit tests for the new ledger item creation logic within the usage ingestion service.
- Integration tests verifying that processing a usage event results in the correct ledger item being persisted.
- Test cases for different pricing scenarios if pricing logic is part of this step.

------
## 8. Integrate Payment Confirmation with Ledger and Credits

### Background
Currently, confirmed payments are not systematically creating credit grants or recognized income in the new ledger system.

This is a problem because payments, which represent value received, are not being recorded in a way that makes them available as spendable credits or as recognized financial events in the ledger.

To solve this, let's modify the payment confirmation process. Upon successful payment confirmation:
1. Create a `UsageCredits` grant.
2. Create a `UsageLedgerItem` of type `'payment_recognized'`.

### Changes
- **Payment Confirmation Service (e.g., `@/services/payments/confirmation.ts` or webhook handler):**
  - Upon receiving and verifying a successful payment confirmation:
    1.  **Create `UsageCredits` record:**
        -   `credit_type`: `'payment_top_up'` or `'payment_period_settlement'`.
        -   `source_reference_id`: The `id` of the successful `Payment` record.
        -   `issued_amount`: Payment amount.
        -   `initial_status`: `'granted_active'`.
        -   Populate other relevant fields.
    2.  **Create `UsageLedgerItem` record:**
        -   `entry_type`: `'payment_recognized'`
        -   `amount`: Positive value of the payment.
        -   `source_payment_id`: The `id` of the `Payment` record.
        -   `source_usage_credit_id`: The `id` of the newly created `UsageCredits` record.
        -   Populate other relevant fields.
  - Ensure these operations occur within a single database transaction.

### Acceptance Criteria
- A successfully confirmed payment results in the creation of one `UsageCredits` record.
- A successfully confirmed payment results in the creation of one `UsageLedgerItem` of type `'payment_recognized'`.
- The ledger item and credit grant accurately reflect the payment amount and source.
- Both records are correctly linked to the original payment and to each other.
- Operations are atomic.

### Test Coverage
- Unit tests for the logic creating credit grants and ledger items post-payment.
- Integration tests verifying the end-to-end flow from payment confirmation to the creation of both records in the database.

------
## 9. Implement Promotional/Goodwill Credit Granting Workflow

### Background
Currently, there isn't a defined workflow for granting non-payment related credits (e.g., promotional, goodwill) and recording them in the new ledger and credit system.

This is a problem because such credits are common and need to be tracked with the same rigor as payment-derived credits for accurate financial accounting.

To solve this, let's implement a workflow (e.g., an admin action or an automated process) that:
1. Creates a `UsageCredits` grant.
2. Creates a `UsageLedgerItem` of type `'credit_grant_recognized'`.

### Changes
- **New Service/Admin Functionality (e.g., `@/services/credits/grant.ts`):**
  - Develop a function/endpoint that takes details for a promotional or goodwill credit.
  - Logic to:
    1.  **Create `UsageCredits` record:**
        -   `credit_type`: e.g., `'granted_promo'`, `'granted_goodwill'`.
        -   `source_reference_id`: e.g., `promo_code_id`, `admin_user_id`.
        -   `issued_amount`, `currency`, `expires_at` (optional).
        -   `initial_status`: `'granted_active'`.
        -   Populate other relevant fields.
    2.  **Create `UsageLedgerItem` record:**
        -   `entry_type`: `'credit_grant_recognized'`
        -   `amount`: Positive value of the granted credit.
        -   `source_usage_credit_id`: The `id` of the new `UsageCredits` record.
        -   Populate other relevant fields.
  - Ensure these operations occur within a single database transaction.

### Acceptance Criteria
- A promotional/goodwill credit grant action results in the creation of one `UsageCredits` record.
- The grant action also results in one `UsageLedgerItem` of type `'credit_grant_recognized'`.
- Both records accurately reflect the grant details and are linked.
- Operations are atomic.

### Test Coverage
- Unit tests for the credit granting logic.
- Integration tests verifying the creation of both `UsageCredits` and `UsageLedgerItem` records.
- If admin UI is involved, tests for that interface.

------
## 10. Implement Credit Application Logic in Billing Process

### Background
The current billing process (as implied, to be refactored) doesn't detail how `UsageCredits` are identified and applied to offset `usage_cost` ledger items, nor how these applications are recorded.

This is a problem because a core function of the credit system – using credits to pay for usage – is missing, along with the necessary audit trail for such applications.

To solve this, let's implement logic within the billing process (or a service it calls) that:
1. Identifies applicable `UsageCredits` grants.
2. For each portion of a grant applied:
    a. Creates a `UsageCreditApplications` record.
    b. Creates a `UsageLedgerItem` of type `'credit_applied_to_usage'`.

### Changes
- **Billing Logic (e.g., within `billingRunHelpers.ts` or a dedicated `@/services/credits/application.ts`):**
  - During a billing run (or real-time for PAYG, if applicable), for a given subscription and period:
    - Identify applicable `UsageCredits` (considering scope like `billing_period_id`, `usage_meter_id`, and `expires_at`).
    - For each grant (or portion) applied to offset calculated usage costs:
      1.  **Create `UsageCreditApplications` record:**
          -   `usage_credit_id`: The `id` of the `UsageCredits` grant.
          -   `amount_applied`: Portion of the credit used.
          -   `calculation_run_id`.
          -   Populate other relevant fields.
      2.  **Create `UsageLedgerItem` record:**
          -   `entry_type`: `'credit_applied_to_usage'`
          -   `amount`: Positive value of the credit amount applied.
          -   `source_usage_credit_id`: The `id` of the `UsageCredits` grant.
          -   `source_credit_application_id`: The `id` of the new `UsageCreditApplications` record.
          -   `applied_to_ledger_item_id` (optional, link to `usage_cost` item).
          -   Populate other relevant fields.
  - Ensure these operations are part of the billing run's transaction.

### Acceptance Criteria
- The billing process correctly identifies and prioritizes applicable credits.
- For each credit application, a `UsageCreditApplications` record is created.
- For each credit application, a `UsageLedgerItem` of type `'credit_applied_to_usage'` is created.
- Records accurately reflect the amount applied and link to the source grant and application.
- The ledger balance reflects the credit application.

### Test Coverage
- Unit tests for credit selection and application logic (e.g., prioritization, expiration handling).
- Integration tests simulating a billing run with various credit scenarios (e.g., full coverage, partial coverage, multiple credits).

------
## 11. Implement Administrative Adjustment of Credit Balance Workflow

### Background
We need a formal process for administrators to adjust the effective value of a previously issued `UsageCredits` grant (e.g., due to an error in the original grant or a clawback).

This is a problem because without a structured workflow and audit trail, such adjustments can be opaque and lead to discrepancies in credit balances.

To solve this, let's implement a workflow that:
1. Creates a `UsageCreditBalanceAdjustments` record detailing the administrative action.
2. Creates a `UsageLedgerItem` of type `'credit_balance_adjusted'` to reflect the financial impact.

### Changes
- **New Service/Admin Functionality (e.g., `@/services/credits/adjustBalance.ts`):**
  - Develop a function/endpoint for administrators to initiate a credit balance adjustment.
  - Input: `adjusted_usage_credit_id`, `adjustment_type`, `amount_adjusted`, `reason`, `adjusted_by_user_id`.
  - Logic to:
    1.  **Create `UsageCreditBalanceAdjustments` record:**
        -   Populate with input details and system-generated timestamps.
    2.  **Create `UsageLedgerItem` record:**
        -   `entry_type`: `'credit_balance_adjusted'`
        -   `amount`: Negative value representing the reduction in credit value (or positive if correcting a previous erroneous reduction, though typical adjustments reduce value).
        -   `source_credit_balance_adjustment_id`: The `id` of the new `UsageCreditBalanceAdjustments` record.
        -   `source_usage_credit_id`: The `id` of the targeted `UsageCredits` grant.
        -   Populate other relevant fields.
  - Ensure these operations occur within a single database transaction.

### Acceptance Criteria
- An administrative credit balance adjustment action creates one `UsageCreditBalanceAdjustments` record.
- The action also creates one `UsageLedgerItem` of type `'credit_balance_adjusted'`.
- Both records accurately reflect the adjustment details and are linked.
- The ledger reflects the change in the subscription's overall credit value.
- Operations are atomic.

### Test Coverage
- Unit tests for the balance adjustment logic.
- Integration tests verifying the creation of both `UsageCreditBalanceAdjustments` and `UsageLedgerItem` records and the impact on a theoretical balance.
- If admin UI is involved, tests for that interface.

------
## 12. Implement Credit Grant Expiration Workflow

### Background
`UsageCredits` grants can have an `expires_at` date. The financial impact of an unused credit portion expiring needs to be formally recorded in the ledger.

This is a problem because without processing expirations, the subscription's ledger balance might not accurately reflect the true available credit value.

To solve this, let's implement a system (e.g., a scheduled job) that:
1. Identifies `UsageCredits` grants that have expired with an unused balance.
2. For each such grant, creates a `UsageLedgerItem` of type `'credit_grant_expired'`.

### Changes
- **Scheduled Job/Service (e.g., `@/services/credits/expirationProcessor.ts`):**
  - Logic to:
    - Query for `UsageCredits` where `expires_at` has passed and `initial_status` was active.
    - For each expired grant, calculate the unused portion: `issued_amount - SUM(UsageCreditApplications.amount_applied where usage_credit_id = expired_grant.id)`.
    - If unused portion > 0:
      1.  **Create `UsageLedgerItem` record:**
          -   `entry_type`: `'credit_grant_expired'`
          -   `amount`: Negative value of the unused, expired portion.
          -   `source_usage_credit_id`: The `id` of the expired `UsageCredits` grant.
          -   `description`: e.g., "Credit grant X expired with Y unused amount".
          -   Populate other relevant fields.
  - Ensure ledger item creation is idempotent for each expiration. Transactions should be per-grant or well-batched.

### Acceptance Criteria
- Expired credit grants with unused balances result in the creation of a `UsageLedgerItem` of type `'credit_grant_expired'`.
- The ledger item's amount accurately reflects the value of the expired, unused portion.
- The process is idempotent and can be run repeatedly without creating duplicate ledger entries for the same expiration.
- The subscription's ledger balance correctly reflects the value lost due to expiration.

### Test Coverage
- Unit tests for the logic identifying expired credits and calculating unused portions.
- Integration tests simulating credit grants with expiration dates, applying some portions, and then running the expiration processor to verify ledger item creation.
- Tests for idempotency of the expiration process.

------
## 13. Integrate Payment Refund Processing with Ledger

### Background
When a payment is refunded, this financial event needs to be recorded in the ledger system, and a source record for the refund itself must exist.

This is a problem because without proper recording, the subscription's financial history and balance will be inaccurate after a refund.

To solve this, let's ensure the payment refund process:
1. Creates a `Refunds` record.
2. Upon successful refund confirmation from the gateway, updates the `Refunds` record.
3. Creates a `UsageLedgerItem` of type `'payment_refunded'`.

### Changes
- **Payment Refund Service (e.g., `@/services/payments/refund.ts` or webhook handler for refund updates):**
  - When a refund is initiated:
    1.  **Create `Refunds` record:**
        -   `payment_id`: Original payment being refunded.
        -   `amount`, `currency`.
        -   `status`: Initially `'pending'` or similar.
        -   Populate other relevant fields.
  - Process refund with the payment gateway.
  - Upon successful refund confirmation from the gateway:
    1.  **Update `Refunds` record:**
        -   Set `status` to `'succeeded'`.
        -   Store `refund_processed_at`, `gateway_refund_id`.
    2.  **Create `UsageLedgerItem` record:**
        -   `entry_type`: `'payment_refunded'`
        -   `amount`: Negative value equal to the refunded amount.
        -   `source_payment_id`: The `id` of the original `Payment` record.
        -   `source_refund_id`: The `id` of the `Refunds` record.
        -   Populate other relevant fields.
  - Ensure database operations are atomic.
  - Consider logic for handling associated `UsageCredits` funded by the original payment (e.g., creating a `UsageCreditBalanceAdjustments` entry as a secondary step, as noted in spec).

### Acceptance Criteria
- Initiating a refund creates a `Refunds` record in a pending state.
- Successful confirmation of a refund updates the `Refunds` record to 'succeeded' and populates gateway details.
- A successful refund results in one `UsageLedgerItem` of type `'payment_refunded'` with a negative amount.
- Ledger item is correctly linked to the original payment and the `Refunds` record.
- The subscription's ledger balance reflects the refunded amount.

### Test Coverage
- Unit tests for refund initiation, confirmation, and ledger posting logic.
- Integration tests simulating the refund lifecycle, including gateway interaction mocks, and verifying record creation and updates.
- Tests for the optional logic of adjusting associated credit grants.

------
## 14. Implement Billing Recalculation and Adjustment Workflow

### Background
Billing periods may need to be recalculated due to corrections or changes, and these recalculations must be reflected financially in the ledger.

This is a problem because without a defined process, recalculations can lead to inconsistent financial records and an unclear audit trail for adjustments.

To solve this, let's implement a workflow where a recalculation:
1. Creates a new `subscription_meter_period_calculations` record (`SMPC_new`) which supersedes an old one (`SMPC_old`).
2. Creates a `UsageLedgerItem` of type `'billing_adjustment'` to reflect the net financial change.

### Changes
- **Recalculation Service (e.g., `@/services/billing/recalculation.ts`):**
  - Develop a function/process to trigger recalculation for a subscription and billing period.
  - Logic to:
    1.  Perform the recalculation based on corrected data/logic.
    2.  Fetch the existing `subscription_meter_period_calculations` record (`SMPC_old`).
    3.  **Create new `subscription_meter_period_calculations` record (`SMPC_new`):**
        -   Populate with new calculation results.
        -   `status`: `'active'`.
        -   `calculation_run_id`: A new ID for this recalculation run.
    4.  **Update `SMPC_old`:**
        -   Set `status` to `'superseded'`.
        -   Set `superseded_by_calculation_id` to `SMPC_new.id`.
    5.  **Create `UsageLedgerItem` record:**
        -   `entry_type`: `'billing_adjustment'`
        -   `amount`: `SMPC_new.net_billed_amount - SMPC_old.net_billed_amount`.
        -   `source_billing_period_calculation_id`: The `id` of `SMPC_new`.
        -   `calculation_run_id`: The ID from the recalculation run.
        -   Populate other relevant fields.
  - Ensure all database operations occur within a single transaction.

### Acceptance Criteria
- A recalculation results in a new 'active' `subscription_meter_period_calculations` record.
- The previous 'active' calculation record for that period is marked 'superseded' and linked to the new one.
- A `UsageLedgerItem` of type `'billing_adjustment'` is created, reflecting the net financial difference.
- The ledger item is linked to the new calculation record.
- All operations are atomic.

### Test Coverage
- Unit tests for the recalculation logic, including fetching old data, creating new data, and calculating differences.
- Integration tests simulating a billing period, then a recalculation, verifying all record creations, updates, and the correctness of the adjustment ledger item.

------
## 15. Refactor `billingRunHelpers.ts` for New Ledger System

### Background
The existing (or placeholder) `billingRunHelpers.ts` likely doesn't incorporate the new detailed ledger system, credit application, or period calculation snapshots.

This is a problem because the core billing process needs to be updated to drive and utilize the new financial recording infrastructure.

To solve this, let's refactor `billingRunHelpers.ts` to:
1. Generate a `calculation_run_id`.
2. Process `UsageEvents` to create `'usage_cost'` ledger items (may leverage Ticket #7).
3. Apply `UsageCredits` (Ticket #10), creating `UsageCreditApplications` and `'credit_applied_to_usage'` ledger items.
4. Generate `SubscriptionMeterPeriodCalculations` records by summarizing ledger items for the run.
5. Manage `active`/`superseded` status for these calculation records.
6. (Future) Generate Invoices/Credit Notes based on calculation snapshots.

### Changes
- **`@/services/billing/billingRunHelpers.ts` (or similarly named core billing process file):**
  - **Generate `calculation_run_id`:** At the start of a billing run for a subscription/period.
  - **Process Usage:**
    - For each relevant `UsageEvent`, ensure a `'usage_cost'` `UsageLedgerItem` is created (or verify its prior creation if usage ingestion is separate), associating it with the `calculation_run_id`.
  - **Apply Credits:**
    - Implement logic from Ticket #10 to identify and apply credits, creating `UsageCreditApplications` and `'credit_applied_to_usage'` `UsageLedgerItems`, associated with the `calculation_run_id`.
  - **Generate `SubscriptionMeterPeriodCalculations`:**
    - After processing all usage and credit applications for each meter in the period:
      - Summarize relevant `UsageLedgerItems` (those with the current `calculation_run_id` for the specific subscription, meter, billing period).
      - Populate `total_raw_usage_amount`, `credits_applied_amount`, `net_billed_amount`.
      - Create a `SubscriptionMeterPeriodCalculations` record with `status = 'active'`, linking it to the `calculation_run_id`.
      - If a previous 'active' calculation for the same scope exists, mark it 'superseded' and link it to the new one (similar to recalculation logic, but for standard runs that might supersede previous interim calculations).
  - Ensure operations are transactional, likely per subscription per period.

### Acceptance Criteria
- A billing run generates a unique `calculation_run_id`.
- All relevant usage is accounted for with `'usage_cost'` ledger items tied to the run.
- Credits are applied correctly, generating associated application records and ledger items tied to the run.
- For each meter/period, a `SubscriptionMeterPeriodCalculations` record is created, accurately summarizing the run's ledger activity.
- `active`/`superseded` statuses of calculation records are managed correctly.
- The process is robust and handles various scenarios (no usage, full credit coverage, partial credit coverage, etc.).

### Test Coverage
- Comprehensive unit tests for each major step of the billing run (usage processing, credit application, summary generation).
- Extensive integration tests simulating end-to-end billing runs for subscriptions with diverse configurations (different meters, credit types, usage patterns).
- Tests for handling of existing calculation records and status updates.
- Performance considerations for large numbers of usage events or subscriptions.
