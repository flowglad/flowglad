# Game Plan: Usage Aggregation and Subscription Credits

This document outlines the plan to implement a robust system for tracking aggregated usage and managing customer credits, enabling accurate billing, flexible credit/debit capabilities, and auditable adjustments.

**Core Philosophy: Billing as a Function of Ground-Truth, Immutable Events & Double-Entry Ledger**

Our billing system must be designed around the principle that all financial states and outcomes (like invoices, credit applications, and billed amounts) are deterministic functions of lower-level, **immutable ground-truth events**. Every financial event or adjustment must be recorded as a new, immutable entry, and every ledger item must trace back to a backing parent record that originated it.

These ground truths include:
1.  `UsageEvents`: Immutable records of what the customer consumed.
2.  `SubscriptionCredits`: Immutable records of credits *granted* to the customer (e.g., from payments, promotions).
3.  `Payments`: Immutable records of payment attempts and their outcomes.
4.  `CreditBalanceAdjustments`: Immutable records of administrative actions to alter the effective value of a previously granted credit.
5.  Configuration Data: Prices, subscription terms, etc., ideally versioned or snapshotted at the time of calculation.

This approach allows us to:
*   **Replay and Recalculate:** If a ground-truth event was missed/incorrect, or if configuration changes retroactively, we can re-process the relevant period to arrive at a new, correct financial outcome by generating new superseding calculation snapshots.
*   **Complete Auditability:** Trace any billed amount, credit application, or balance change back to its source events and the specific calculation run or administrative action that produced it. The ledger provides the full story.
*   **Resilience to Adjustments:** Handle corrections, retroactive changes, and disputes by generating new calculation outcomes and ledger entries that supersede previous ones, while preserving the complete history.

## 1. Database Schema Changes

We'll introduce the following key tables: `SubscriptionLedgerItems` (the central financial journal), `SubscriptionCredits` (for grant events), `SubscriptionCreditApplications` (for itemized use of grants), `CreditBalanceAdjustments` (for administrative changes to granted credits), and `SubscriptionMeterPeriodCalculations` (for append-only snapshots of period-end calculations).

### 1.1. `SubscriptionCredits` Table (Record of Grants - Immutable Post-Creation)

This table stores records of distinct credit grants or funding events (like payments) for subscriptions. Once created, these records are immutable regarding their `issued_amount` and core details. Their effective remaining value is determined by activity on the `SubscriptionLedgerItems` and `SubscriptionCreditApplications` tables.

```sql
CREATE TABLE subscription_credits (
    id TEXT PRIMARY KEY DEFAULT Nanoid('sub_credit'),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,

    credit_type TEXT NOT NULL,                          -- e.g., 'granted_promo', 'granted_goodwill', 'payment_top_up', 'payment_period_settlement'
    source_reference_id TEXT,                           -- e.g., promo_code_id, payment_id, admin_user_id, adjustment_id that led to this grant
    
    billing_period_id TEXT REFERENCES billing_periods(id), -- Optional: If set, this credit is scoped to this billing period.
    usage_meter_id TEXT REFERENCES usage_meters(id),    -- Optional: For meter-specific credits.

    issued_amount INTEGER NOT NULL,                     -- The original, immutable value of this credit grant.
    currency CHAR(3) NOT NULL,

    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,                -- Nullable, if the credit grant has an expiration date.

    initial_status TEXT NOT NULL,                       -- e.g., 'pending_payment_confirmation' (for payment-derived), 'granted_active' (for others). Status at time of grant.
    notes TEXT,
    metadata JSONB,                                     -- For storing flexible, contextual, non-indexed information.

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- Should only be for non-financial metadata or system flags, not for amount/core status.
);

-- Indexes (similar to previous version, add source_reference_id if queried often)
CREATE INDEX idx_sub_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX idx_sub_credits_organization_id ON subscription_credits(organization_id);
CREATE INDEX idx_sub_credits_expires_at ON subscription_credits(expires_at);
```

**Zod Schema (`subscriptionCredits.ts`):**
*   Define `subscriptionCredits` Drizzle schema, reflecting immutability of core financial fields. Include the new `metadata` field.

### 1.2. `CreditBalanceAdjustments` Table (Record of Administrative Adjustments to Granted Credits)

This table records explicit administrative actions to change the effective value of a previously granted credit (e.g., clawbacks, corrections of grant errors).

```sql
CREATE TABLE credit_balance_adjustments (
    id TEXT PRIMARY KEY DEFAULT Nanoid('cba'),
    adjusted_subscription_credit_id TEXT NOT NULL REFERENCES subscription_credits(id), -- The specific credit grant being targeted.
    adjustment_type TEXT NOT NULL,                      -- e.g., 'clawback_error', 'clawback_terms_violation', 'admin_reduction', 'grant_correction'
    amount_adjusted INTEGER NOT NULL,                   -- Positive value representing the amount being effectively removed/added to the grant's potential.
    currency CHAR(3) NOT NULL,                          -- Should match the target subscription_credits record.
    reason TEXT NOT NULL,
    adjusted_by_user_id TEXT,                           -- Or system actor ID.
    adjustment_initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    metadata JSONB,                                     -- For storing flexible, contextual, non-indexed information.
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cba_adjusted_sub_credit_id ON credit_balance_adjustments(adjusted_subscription_credit_id);
```

**Zod Schema (`creditBalanceAdjustments.ts`):**
*   Define schema for this new table. Include the new `metadata` field.

### 1.3. `SubscriptionCreditApplications` Table (Itemized Use of Granted Credits)

This table stores an immutable record for each instance a portion (or all) of a `SubscriptionCredits` grant is applied to offset usage costs during a calculation run. This provides itemized deduction tracking.

```sql
CREATE TABLE subscription_credit_applications (
    id TEXT PRIMARY KEY DEFAULT Nanoid('sub_credit_app'),
    subscription_usage_credit_id TEXT NOT NULL REFERENCES subscription_credits(id), -- FK to the credit grant that was applied.
    calculation_run_id TEXT NOT NULL,                     -- Links to calculation_run_id in subscription_meter_period_calculations.
    amount_applied INTEGER NOT NULL,
    currency CHAR(3) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    target_usage_meter_id TEXT REFERENCES usage_meters(id), -- Optional: Specific meter this application offset.
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Indexes (as previously discussed)
CREATE INDEX idx_sub_credit_app_credit_id ON subscription_credit_applications(subscription_usage_credit_id);
CREATE INDEX idx_sub_credit_app_calc_run_id ON subscription_credit_applications(calculation_run_id);
```

**Zod Schema (`subscriptionCreditApplications.ts`):**
*   Define schema for this new table.

### New Table: `Refunds` (after SubscriptionCreditApplications, before SubscriptionLedgerItems)

### 1.4. `Refunds` Table

This table will serve as the "backing parent record" for ledger entries related to payment refunds.

```sql
CREATE TABLE refunds (
    id TEXT PRIMARY KEY DEFAULT Nanoid('refund'),
    payment_id TEXT NOT NULL REFERENCES payments(id), -- The original payment that is being refunded
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,

    amount INTEGER NOT NULL,                      -- The amount being refunded. Can be partial or full.
    currency CHAR(3) NOT NULL,                   -- Should match the original payment.
    reason TEXT,                                -- Reason for the refund (e.g., 'customer_request', 'fraudulent_charge', 'product_not_received')
    status TEXT NOT NULL,                       -- e.g., 'pending', 'succeeded', 'failed' (tracks the refund process with the payment processor)
    
    refund_processed_at TIMESTAMP WITH TIME ZONE, -- When the refund was successfully processed by the payment gateway
    gateway_refund_id TEXT,                     -- The transaction ID of the refund from the payment processor

    notes TEXT,                                 -- Internal notes
    initiated_by_user_id TEXT,                  -- Admin user who initiated the refund, if applicable

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_subscription_id ON refunds(subscription_id);
CREATE INDEX idx_refunds_status ON refunds(status);
```

**Zod Schema (`refunds.ts`):**
*   Define the Drizzle schema for this new `refunds` table.
*   Immutable Core Fields (once `status` is terminal like `'succeeded'` or `'failed'`): `id`, `payment_id`, `subscription_id`, `organization_id`, `livemode`, `amount`, `currency`, `status` (terminal), `refund_processed_at`, `gateway_refund_id`.

### 1.5. `SubscriptionLedgerItems` Table (The Grand Financial Journal)

This is the central, immutable, append-only ledger recording all financial events and value movements for a subscription. Every entry must be traceable to a source event/record.

```sql
CREATE TABLE subscription_ledger_items (
    id TEXT PRIMARY KEY DEFAULT Nanoid('sli'),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    entry_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    entry_type TEXT NOT NULL,       -- e.g., 'usage_cost', 'payment_recognized', 'credit_grant_recognized', 'credit_applied_to_usage', 'credit_balance_adjusted', 'credit_grant_expired', 'billing_adjustment', 'payment_refunded'
    amount INTEGER NOT NULL,        -- Positive for credits/value-in, Negative for debits/value-out from subscription's perspective.
    currency CHAR(3) NOT NULL,
    description TEXT,

    -- Source linkage for traceability
    source_usage_event_id TEXT REFERENCES usage_events(id),                           
    source_subscription_credit_id TEXT REFERENCES subscription_credits(id),         
    source_payment_id TEXT REFERENCES payments(id),                                 
    source_credit_application_id TEXT REFERENCES subscription_credit_applications(id),
    source_credit_balance_adjustment_id TEXT REFERENCES credit_balance_adjustments(id),
    source_billing_period_calculation_id TEXT REFERENCES subscription_meter_period_calculations(id), -- For entries that are summaries or outcomes of a period calculation itself.

    applied_to_ledger_item_id TEXT REFERENCES subscription_ledger_items(id), -- e.g., a credit_applied_to_usage item linking to the usage_cost item it offsets.

    billing_period_id TEXT REFERENCES billing_periods(id), -- Nullable, for entries not tied to a specific period (e.g. evergreen top-ups)
    usage_meter_id TEXT REFERENCES usage_meters(id),    -- Nullable
    calculation_run_id TEXT,                            -- The batch process or specific operation run that generated this entry.
    metadata JSONB,                                     -- For storing flexible, contextual, non-indexed information.
    
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Indexes (ensure comprehensive indexing for querying by source_ids, entry_type, subscription_id, entry_timestamp)
CREATE INDEX idx_sli_subscription_id_timestamp ON subscription_ledger_items(subscription_id, entry_timestamp);
CREATE INDEX idx_sli_entry_type ON subscription_ledger_items(entry_type);
-- Add indexes for all source_..._id columns that will be queried.
```

**Zod Schema (`subscriptionLedgerItems.ts`):**
*   Define Drizzle schema. Include the new `metadata` field.

### 1.6. `subscription_meter_period_calculations` Table (Append-Only Snapshots of Period Calculations)

This table stores an immutable snapshot for *each time* a calculation is performed and finalized for a specific usage meter within a subscription's billing period. Its values are derived from summarizing relevant `SubscriptionLedgerItems` during a `calculation_run_id`.

```sql
CREATE TABLE subscription_meter_period_calculations (
    id TEXT PRIMARY KEY DEFAULT Nanoid('smpc'),
    calculation_run_id TEXT NOT NULL UNIQUE, 
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    usage_meter_id TEXT NOT NULL REFERENCES usage_meters(id),
    billing_period_id TEXT NOT NULL REFERENCES billing_periods(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    calculation_type TEXT NOT NULL, -- e.g., 'billing_run', 'interim_estimate', 'adjustment_recalculation'
    total_raw_usage_amount INTEGER NOT NULL, -- Sum of 'usage_cost' ledger items for this meter/period/run.
    credits_applied_amount INTEGER NOT NULL, -- Sum of 'credit_applied_to_usage' ledger items for this meter/period/run.
    net_billed_amount INTEGER NOT NULL, -- total_raw_usage_amount + credits_applied_amount (usage is negative)
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'superseded', 'pending_confirmation'
    superseded_by_calculation_id TEXT REFERENCES subscription_meter_period_calculations(id),
    source_invoice_id TEXT, -- If this calculation resulted in an invoice
    source_credit_note_id TEXT, -- If this calculation resulted in a credit note
    notes TEXT, -- Internal notes about this calculation run
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Mainly for status changes like 'superseded'
    CONSTRAINT uq_active_calculation UNIQUE (subscription_id, usage_meter_id, billing_period_id, status) WHERE (status = 'active')
);
-- Indexes (as previously defined)
```

**Zod Schema (`subscriptionMeterPeriodCalculations.ts`):** (As previously defined).

## 2. Code Changes to Existing Files

*   **Core Principle:** All financial operations now revolve around creating immutable `SubscriptionLedgerItems`. `SubscriptionCredits` records grants. `SubscriptionCreditApplications` details the use of those grants. `CreditBalanceAdjustments` records admin changes to grant effectiveness. `SubscriptionMeterPeriodCalculations` snapshots period outcomes based on ledger activity.

*   **`billingRunHelpers.ts`:**
    1.  **Generate `calculation_run_id`**.
    2.  **Process `UsageEvents` for the period:** For each, create a `SubscriptionLedgerItem` (`entry_type: 'usage_cost'`, negative amount, linked to `source_usage_event_id`).
    3.  **Apply Credits:**
        *   Identify applicable `SubscriptionCredits` (grants).
        *   For each grant portion applied: Insert into `SubscriptionCreditApplications`. Insert a `SubscriptionLedgerItem` (`entry_type: 'credit_applied_to_usage'`, positive amount, linking to `source_subscription_credit_id` and `source_credit_application_id`).
    4.  **Generate `SubscriptionMeterPeriodCalculations` records:** Summarize the ledger items for each meter for this `calculation_run_id` to populate these snapshot records. Manage `active`/`superseded` status.
    5.  Generate Invoices/Credit Notes based on the totals from these calculation snapshots.

*   **Administrative Adjustment Processes (New):**
    1.  Record the intent in `CreditBalanceAdjustments`.
    2.  Create a `SubscriptionLedgerItem` (`entry_type: 'credit_balance_adjusted'`, negative amount, linking to `source_credit_balance_adjustment_id` and the targeted `source_subscription_credit_id`).

*   **Payment Processing:**
    1.  On successful `Payment` (after confirmation), create a `SubscriptionCredits` grant (`credit_type: 'payment_top_up'` or `'payment_period_settlement'`, `initial_status: 'granted_active'`).
    2.  Create a `SubscriptionLedgerItem` (`entry_type: 'payment_recognized'`, positive amount, linking to `source_payment_id` and the new `source_subscription_credit_id`).

## 3. Event Workflows and Ledger Posting

This section details the typical sequence of events, from an originating action to the creation of `SubscriptionLedgerItems`. It also clarifies the immutability of core fields in the backing parent records that source these ledger entries.

### 3.0 Guiding Principles for Ledger Operations

Before detailing specific event flows, the following principles guide ledger operations to ensure robustness, auditability, and clarity:

*   **Idempotency:** All external write operations that result in the creation of financial records (e.g., initiating payments, granting credits via API, processing webhook-driven events like payment confirmations or usage event ingestion) should ideally support an idempotency key provided by the client or initiating system. This key allows the system to safely retry operations without risk of duplicate record creation. While not all V1 interfaces may expose this immediately, the underlying services should be designed with idempotency in mind for future-proofing. Operations that create `SubscriptionCredits`, `CreditBalanceAdjustments`, or direct `SubscriptionLedgerItems` from external triggers are key candidates for this.

*   **Timestamp Conventions:** Clarity in timestamps is crucial for accurate financial record-keeping and auditability.
    *   `SubscriptionLedgerItems.entry_timestamp`: This timestamp (defaulting to `CURRENT_TIMESTAMP` upon record creation) represents when the ledger item was created *in our system*.
    *   `Effective Event Time`: For understanding when the financial event *actually occurred* in the real world or source system (which may differ from when it was recorded in our ledger), queries should join back to the source record's own timestamp. Examples include `UsageEvents.event_timestamp` (for usage costs), `Payments.processed_at` (for payment recognitions), or `SubscriptionCredits.issued_at` (for credit grants).
    *   System documentation should clearly outline these conventions for all relevant timestamps across financial tables to ensure consistent interpretation.

    *   **Understanding `calculation_run_id`:** This identifier is crucial for tracing and grouping records related to a specific execution instance of a calculation or billing process.
        *   **Nature:** It's a unique ID (e.g., UUID, Nanoid) generated by the application at the start of a distinct operational job (e.g., a nightly billing run, an ad-hoc recalculation, a credit application batch).
        *   **Usage as a Common Thread:** It acts as a "batch identifier," linking all records created or significantly affected during that single, specific operational run.
        *   **In `subscription_meter_period_calculations`:** Here, `calculation_run_id` (marked `UNIQUE`) uniquely identifies the summary snapshot record produced by that specific run.
        *   **In `subscription_ledger_items` and `subscription_credit_applications`:** A `calculation_run_id` (nullable in ledger items) tags records that were generated *as part of* that specific calculation run. For example, usage cost ledger items and credit application ledger items created during `run-xyz` would all carry this ID.
        *   **Not Typically a Direct Foreign Key (from ledger items to summary):** Generally, `subscription_ledger_items.calculation_run_id` (or from `subscription_credit_applications`) is *not* an enforced foreign key to `subscription_meter_period_calculations.calculation_run_id`. This is primarily due to the order of operations: ledger items are created *during* the run, while the `subscription_meter_period_calculations` summary record (which often summarizes these very items) is finalized and saved *at the end* of the run. Enforcing an FK would create a circular dependency in the process flow. Integrity is typically maintained at the application logic level by ensuring consistent tagging.

*   **Use of `metadata` fields:** Key financial tables (`SubscriptionCredits`, `CreditBalanceAdjustments`, `SubscriptionLedgerItems`) now include a `metadata JSONB` field. This field is intended for storing flexible, contextual, non-indexed information relevant to the specific record. Examples include related entity IDs not suitable for foreign keys (e.g., a specific promotion campaign ID for a credit grant), system actor details (e.g., `'system:webhook_processor'`), diagnostic information, or any other pertinent data that aids in auditing or understanding the context of the record without requiring frequent schema changes.

### 3.1. Backing Parent Records: Immutability

Once a backing parent record is created and represents a factual financial event, its core attributes defining that event should be immutable. The `updated_at` timestamp may change for system reasons or non-critical metadata, but not the financial facts.

*   **`UsageEvents`** (Assumed Schema - defined elsewhere)
    *   Immutable Core Fields: `id`, `subscription_id`, `organization_id`, `event_timestamp`, `meter_id`, `quantity`, `properties_for_pricing`, `idempotency_key`.
*   **`Payments`** (Assumed Schema - defined elsewhere)
    *   Immutable Core Fields (post-confirmation of a terminal state like 'succeeded' or 'failed'): `id`, `subscription_id`, `organization_id`, `amount`, `currency`, `status` (terminal status), `payment_method_details`, `transaction_id_from_processor`, `processed_at`.
*   **`SubscriptionCredits`**
    *   Immutable Core Fields: `id`, `subscription_id`, `organization_id`, `livemode`, `credit_type`, `source_reference_id`, `billing_period_id` (if set at creation), `usage_meter_id` (if set at creation), `issued_amount`, `currency`, `issued_at`, `expires_at` (if set at creation), `initial_status`.
*   **`CreditBalanceAdjustments`**
    *   Immutable Core Fields: `id`, `adjusted_subscription_credit_id`, `adjustment_type`, `amount_adjusted`, `currency`, `reason`, `adjusted_by_user_id`, `adjustment_initiated_at`, `organization_id`, `livemode`.
*   **`SubscriptionCreditApplications`**
    *   Immutable Core Fields: `id`, `subscription_usage_credit_id`, `calculation_run_id`, `amount_applied`, `currency`, `applied_at`, `target_usage_meter_id`, `organization_id`, `livemode`.

### 3.2. Event-to-Ledger Workflows

All workflows operate within database transactions to ensure atomicity.

1.  **Usage Event Ingestion & Processing**
    *   **Event:** A `UsageEvent` is successfully ingested and validated for a subscription.
    *   **Ledger Posting:**
        *   Create one `SubscriptionLedgerItem`:
            *   `entry_type`: `'usage_cost'`
            *   `amount`: Negative value representing the calculated cost of the usage (pricing logic applied here).
            *   `currency`: Currency of the usage cost.
            *   `description`: e.g., "Usage for meter X on YYYY-MM-DD".
            *   `source_usage_event_id`: The `id` of the `UsageEvent`.
            *   `subscription_id`, `organization_id`, `livemode`, `billing_period_id` (if applicable), `usage_meter_id`.

2.  **Payment Confirmation (Successful)**
    *   **Event:** A `Payment` record is confirmed as successful (e.g., webhook from processor).
    *   **Parent Record Creation (`SubscriptionCredits`):**
        *   Create one `SubscriptionCredits` record:
            *   `credit_type`: `'payment_top_up'` (for PAYG) or `'payment_period_settlement'` (for invoice payment).
            *   `source_reference_id`: The `id` of the successful `Payment` record.
            *   `issued_amount`: The amount of the confirmed payment.
            *   `currency`: Payment currency.
            *   `initial_status`: `'granted_active'`. 
            *   `subscription_id`, `organization_id`, `livemode`, `issued_at` (timestamp of confirmation).
    *   **Ledger Posting:**
        *   Create one `SubscriptionLedgerItem`:
            *   `entry_type`: `'payment_recognized'`
            *   `amount`: Positive value of the payment.
            *   `currency`: Payment currency.
            *   `description`: e.g., "Payment received via card ending XXXX".
            *   `source_payment_id`: The `id` of the `Payment` record.
            *   `source_subscription_credit_id`: The `id` of the newly created `SubscriptionCredits` record.
            *   `subscription_id`, `organization_id`, `livemode`.

3.  **Granting Promotional or Goodwill Credits**
    *   **Event:** An administrative action or automated process decides to grant a non-payment credit.
    *   **Parent Record Creation (`SubscriptionCredits`):**
        *   Create one `SubscriptionCredits` record:
            *   `credit_type`: e.g., `'granted_promo'`, `'granted_goodwill'`. 
            *   `source_reference_id`: e.g., `promo_code_id`, internal campaign ID, or `admin_user_id` initiating the grant.
            *   `issued_amount`: The amount of the credit being granted.
            *   `currency`: Credit currency.
            *   `initial_status`: `'granted_active'`.
            *   `expires_at`: (Optional) If the grant has an expiration date.
            *   `subscription_id`, `organization_id`, `livemode`, `issued_at`.
    *   **Ledger Posting:**
        *   Create one `SubscriptionLedgerItem`:
            *   `entry_type`: `'credit_grant_recognized'`
            *   `amount`: Positive value of the granted credit.
            *   `currency`: Credit currency.
            *   `description`: e.g., "Promotional credit APPSUMO2024 applied".
            *   `source_subscription_credit_id`: The `id` of the newly created `SubscriptionCredits` record.
            *   `subscription_id`, `organization_id`, `livemode`.

4.  **Applying Credits to Usage (During Billing Run or Real-time for PAYG)**
    *   **Event:** The system (e.g., billing run logic) identifies an applicable `SubscriptionCredits` grant and decides to use a portion (or all) of it to offset accumulated `usage_cost` ledger items.
    *   **Parent Record Creation (`SubscriptionCreditApplications`):**
        *   Create one `SubscriptionCreditApplications` record for each distinct grant application:
            *   `subscription_usage_credit_id`: The `id` of the `SubscriptionCredits` grant being applied.
            *   `amount_applied`: The portion of the credit grant being used in this instance.
            *   `currency`: Credit currency.
            *   `calculation_run_id`: (If applicable, e.g., during a billing run) The ID of the calculation process.
            *   `applied_at`, `target_usage_meter_id` (optional), `organization_id`, `livemode`.
    *   **Ledger Posting:**
        *   Create one `SubscriptionLedgerItem`:
            *   `entry_type`: `'credit_applied_to_usage'`
            *   `amount`: Positive value of the credit amount being applied (acts as an offset).
            *   `currency`: Credit currency.
            *   `description`: e.g., "Credit from grant X applied to usage in billing period Y".
            *   `source_subscription_credit_id`: The `id` of the `SubscriptionCredits` grant used.
            *   `source_credit_application_id`: The `id` of the new `SubscriptionCreditApplications` record.
            *   `applied_to_ledger_item_id`: (Optional, but good practice for direct linking) Could link to a specific `usage_cost` ledger item or a summary ledger item for the period's usage if such an item exists.
            *   `subscription_id`, `organization_id`, `livemode`, `billing_period_id` (if applicable), `usage_meter_id` (if applicable).

5.  **Administrative Adjustment of Credit Balance (e.g., Clawback of a Granted Credit)**
    *   **Event:** An administrative decision is made to reduce the effective value of a previously issued `SubscriptionCredits` grant (e.g., error in grant, terms violation).
    *   **Parent Record Creation (`CreditBalanceAdjustments`):**
        *   Create one `CreditBalanceAdjustments` record:
            *   `adjusted_subscription_credit_id`: The `id` of the `SubscriptionCredits` grant being adjusted.
            *   `adjustment_type`: e.g., `'clawback_error'`, `'admin_reduction'`. 
            *   `amount_adjusted`: Positive value representing the amount by which the original grant's utility is being reduced.
            *   `currency`: Currency of the adjustment.
            *   `reason`: Textual reason for adjustment.
            *   `adjusted_by_user_id`, `adjustment_initiated_at`, `organization_id`, `livemode`.
    *   **Ledger Posting:**
        *   Create one `SubscriptionLedgerItem`:
            *   `entry_type`: `'credit_balance_adjusted'`
            *   `amount`: Negative value representing the reduction in credit value.
            *   `currency`: Adjustment currency.
            *   `description`: e.g., "Clawback of credit grant X due to Y".
            *   `source_credit_balance_adjustment_id`: The `id` of the new `CreditBalanceAdjustments` record.
            *   `source_subscription_credit_id`: The `id` of the `SubscriptionCredits` grant that was targeted by the adjustment.
            *   `subscription_id`, `organization_id`, `livemode`.

6.  **Credit Grant Expiration**
    *   **Event:** A system process (e.g., daily batch job) identifies a `SubscriptionCredits` grant whose `expires_at` date has passed and has an unused balance.
        *   The unused portion is `SubscriptionCredits.issued_amount - SUM(SubscriptionCreditApplications.amount_applied where subscription_usage_credit_id = expired_grant.id)`.
    *   **Ledger Posting:**
        *   Create one `SubscriptionLedgerItem` (if unused portion > 0):
            *   `entry_type`: `'credit_grant_expired'`
            *   `amount`: Negative value of the unused, expired portion of the credit.
            *   `currency`: Currency of the credit grant.
            *   `description`: e.g., "Credit grant X expired with Y unused amount".
            *   `source_subscription_credit_id`: The `id` of the expired `SubscriptionCredits` grant.
            *   `subscription_id`, `organization_id`, `livemode`.

7.  **Payment Refund Processing**
    *   **Event:** A refund is initiated for a specific, previously successful `Payment`.
    *   **Parent Record Creation (`Refunds`):
        *   Create one `Refunds` record:
            *   `payment_id`: The `id` of the original `Payment` being refunded.
            *   `amount`, `currency`: The amount and currency of the refund.
            *   `status`: Initially `'pending'` (or as appropriate for gateway interaction).
            *   `reason`, `initiated_by_user_id`, `subscription_id`, `organization_id`, `livemode`.
    *   **(Process refund with payment gateway)**
    *   **On Refund Confirmation (Successful from Gateway):**
        *   Update `Refunds` record: Set `status` to `'succeeded'`, store `refund_processed_at`, `gateway_refund_id`.
        *   **Ledger Posting:**
            *   Create one `SubscriptionLedgerItem`:
                *   `entry_type`: `'payment_refunded'`
                *   `amount`: **Negative value** equal to the refunded amount.
                *   `currency`: Refund currency.
                *   `description`: e.g., "Refund for original payment ID [Payment.id]".
                *   `source_payment_id`: The `id` of the original `Payment` record.
                *   `source_refund_id`: The `id` of the new `Refunds` record from this workflow step.
                *   `subscription_id`, `organization_id`, `livemode`.
    *   **Consideration for Associated Credits:** If the original payment funded a `SubscriptionCredits` grant, the posting of the `'payment_refunded'` ledger item correctly adjusts the subscription's overall balance. A secondary, optional step could be to create a `CreditBalanceAdjustments` entry to administratively reduce or invalidate the unspent portion of the original `SubscriptionCredits` grant, further clarifying that its funding was revoked. This would generate an additional `'credit_balance_adjusted'` ledger item.

8.  **Billing Recalculation and Adjustment**
    *   **Event:** A recalculation is triggered for a specific billing period (e.g., due to corrected usage data, retroactive price changes, or fixing a previous calculation error). This results in a new `subscription_meter_period_calculations` record (`SMPC_new`) for that period, which supersedes a previous one (`SMPC_old`). The `SMPC_old.status` is updated to `'superseded'`, and `SMPC_old.superseded_by_calculation_id` points to `SMPC_new.id`.
    *   **Parent Record Linkage:** The primary source record for the ledger item is the new `subscription_meter_period_calculations` record (`SMPC_new`).
    *   **Ledger Posting (to reflect the *net change* from the recalculation):**
        *   Create one `SubscriptionLedgerItem`:
            *   `entry_type`: `'billing_adjustment'`
            *   `amount`: The difference in the `net_billed_amount` between `SMPC_new` and `SMPC_old`. (i.e., `SMPC_new.net_billed_amount - SMPC_old.net_billed_amount`). This can be positive (if the new calculation results in a higher charge) or negative (if it results in a lower charge or a credit).
            *   `currency`: The billing currency for the period.
            *   `description`: e.g., "Billing adjustment due to recalculation [SMPC_new.id] for period [billing_period_id], superseding [SMPC_old.id]".
            *   `source_billing_period_calculation_id`: The `id` of `SMPC_new`.
            *   `calculation_run_id`: The `calculation_run_id` associated with the recalculation process that generated `SMPC_new`.
            *   `billing_period_id`: The `id` of the billing period being adjusted.
            *   `subscription_id`, `organization_id`, `livemode`.

## Answered Questions from Previous Discussions

1.  **Q: How do we aggregate credits scoped to a billing period vs to a whole run (evergreen)?**
    *   **A:** The `SubscriptionCredits` table has an optional `billing_period_id`. When applying credits, the application logic (e.g., in a billing run) will query for relevant credits, prioritizing those scoped to the current `billing_period_id` before considering evergreen credits (where `billing_period_id` is NULL). The `SubscriptionLedgerItems` created for credit applications will reflect which grant was used, and the `SubscriptionCreditApplications` table also records this link.

2.  **Q: Is the ledger going to run across the lifetime of the subscription?**
    *   **A:** Yes. `SubscriptionLedgerItems` are associated with a `subscription_id` and are not inherently limited by billing periods (though many entries will have a `billing_period_id` for attribution). This allows for a continuous financial history for the subscription, accommodating both temporal billing periods and ongoing PAYG/wallet models.

3.  **Q: For payment associated ledger items, how do we post them? Do we post them when the payment has been created, and mark them as unsettled until the payment is confirmed?**
    *   **A:** A `SubscriptionCredits` record is created with an `initial_status` like `'pending_payment_confirmation'` when a payment process starts. The corresponding `'payment_recognized'` entry in `SubscriptionLedgerItems` (which makes the value spendable by the system) and the update of the `SubscriptionCredits` grant to an active/available state should only occur *after* the payment is confirmed (e.g., webhook received, payment status becomes 'succeeded'). If a payment fails, the `SubscriptionCredits` grant reflects this (e.g., status `'payment_failed_voided'` or similar, or it's never activated), and no positive ledger entry for a recognized payment is created, or a counteracting one is posted if an initial pending entry was made.

4.  **Q: Do we want a settlement status on the `SubscriptionLedgerItems`? Or is posting on the ledger the equivalent of settlement? What is the best practice for double entry ledgers - do the items have statuses?**
    *   **A:** Generally, in pure double-entry, ledger items are immutable facts representing financial events. "Settlement" of a debit (like a `'usage_cost'`) is typically a derived concept: it's settled when its negative amount is offset by corresponding positive-amount ledger items (like `'credit_applied_to_usage'` or `'payment_recognized'` that effectively covers it). The source domain records (e.g., `UsageEvent.settlement_status`) are better suited to track operational lifecycle statuses. The ledger reflects the *financial impact* and history, not mutable operational states of its own entries.

## Open Questions for Further Design

1.  **Q: If the ledger tracks the lifetime of the subscription, how do we determine the aggregate balance, considering credit expirations?**
    *   **A (Refined):** The current aggregate balance of a subscription is `SUM(amount)` from all its `SubscriptionLedgerItems`. When a `SubscriptionCredits` grant (recorded in the `SubscriptionCredits` table) expires, an immutable `SubscriptionLedgerItems` entry (`entry_type: 'credit_grant_expired'`, with a negative amount equal to the then-unused portion of the grant, linked to the `source_subscription_credit_id`) must be created. The unused portion is determined by `issued_amount - SUM(amount_applied from SubscriptionCreditApplications for that grant)`. This ledger entry ensures the overall balance accurately reflects value lost due to expiration. The *process and frequency* of creating these `'credit_grant_expired'` ledger entries (e.g., daily batch job checking `expires_at` dates) needs to be defined.

2.  **Q: What kind of Zod schema constraints must we apply to the ledger items?**
    *   Beyond standard type/nullability: For `SubscriptionLedgerItems`, Zod schemas should enforce conditional requirements for `source_..._id` fields based on `entry_type`. For example, if `entry_type` is `'usage_cost'`, then `source_usage_event_id` must be present. Referential integrity with `amount` signs (e.g., `'usage_cost'` is negative, `'payment_recognized'` is positive) should also be considered.

3.  **Q: Should the "payment" associated backing record for a `SubscriptionLedgerItem` of type `'payment_recognized'` be the `Payment` record itself, or an `Invoice` it settles, or an `InvoiceLineItem`?**
    *   **Open Question:** The current design links `SubscriptionLedgerItems` of `entry_type = 'payment_recognized'` to `source_payment_id` (the `Payments` table record) and `source_subscription_credit_id` (the `SubscriptionCredits` grant that the payment funded). The `Payment` record itself can be linked to an `Invoice`. This provides direct traceability to the payment. Is this sufficient, or is a more direct link from the ledger item to an `Invoice` (if the payment is for an invoice) also required or beneficial for certain reporting/querying scenarios? This needs further consideration based on reporting needs.

4.  **Q: How do we ensure atomicity when, for example, an adjustment involves creating a `CreditBalanceAdjustments` record AND a `SubscriptionLedgerItems` record, or when a billing run inserts multiple ledger items and updates `SubscriptionMeterPeriodCalculations`?**
    *   **Open Question:** All related database operations for a single logical event (like an adjustment or a billing run's processing for one period) must occur within a single database transaction to ensure atomicity and data integrity. The specific transaction boundaries for different processes (billing run, PAYG real-time application, administrative adjustments) need to be carefully defined and implemented in the application logic.

5.  **Q: For PAYG wallet models with real-time credit application, what are the performance implications of creating multiple ledger items per usage event (one for cost, one for credit application)?**
    *   **Open Question:** If usage event volume is extremely high, inserting 2+ ledger items per usage event in real-time might become a bottleneck. Strategies like micro-batching (e.g., aggregating usage costs and credit applications over a 1-minute window and then writing summarized ledger entries) might be needed. This requires evaluating expected load and benchmarking.

This revised game plan focuses on an append-only, auditable ledger for all financial events and calculations, providing much greater resilience and clarity for adjustments and historical tracking across various subscription models.
