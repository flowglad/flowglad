# Game Plan: Usage Aggregation and Subscription Credits

This document outlines the plan to implement a robust system for tracking aggregated usage and managing customer credits, enabling accurate billing, flexible credit/debit capabilities, and auditable adjustments.

**Core Philosophy: Billing as a Function of Ground-Truth, Immutable Events & Double-Entry Ledger**

Our billing system must be designed around the principle that all financial states and outcomes (like invoices, credit applications, and billed amounts) are deterministic functions of lower-level, **immutable ground-truth events**. Every financial event or adjustment must be recorded as a new, immutable entry, and every ledger item must trace back to a backing parent record that originated it.

These ground truths include:
1.  `UsageEvents`: Immutable records of what the customer consumed.
2.  `UsageCredits`: Immutable records of credits *granted* to the customer (e.g., from payments, promotions).
3.  `Payments`: Immutable records of payment attempts and their outcomes.
4.  `UsageCreditBalanceAdjustments`: Immutable records of administrative actions to alter the effective value of a previously granted credit.
5.  Configuration Data: Prices, subscription terms, etc., ideally versioned or snapshotted at the time of calculation.

This approach allows us to:
*   **Replay and Recalculate:** If a ground-truth event was missed/incorrect, or if configuration changes retroactively, we can re-process the relevant period to arrive at a new, correct financial outcome by generating new superseding calculation snapshots.
*   **Complete Auditability:** Trace any billed amount, credit application, or balance change back to its source events and the specific calculation run or administrative action that produced it. The ledger provides the full story.
*   **Resilience to Adjustments:** Handle corrections, retroactive changes, and disputes by generating new calculation outcomes and ledger entries that supersede previous ones, while preserving the complete history.

## 1. Database Schema Changes

We'll introduce the following key tables: `LedgerEntries` (the central financial journal), `UsageCredits` (for grant events), `UsageCreditApplications` (for itemized use of grants), `UsageCreditBalanceAdjustments` (for administrative changes to granted credits), `SubscriptionMeterPeriodCalculations` (for append-only snapshots of period-end calculations), and a new `LedgerTransactions` table to group related ledger items.

### 1.1. `UsageCredits` Table (Record of Grants - Immutable Post-Creation)

This table stores records of distinct credit grants or funding events (like payments) for subscriptions. Once created, these records are immutable regarding their `issued_amount` and core details. Their effective remaining value is determined by activity on the `LedgerEntries` and `UsageCreditApplications` tables.

```sql
CREATE TABLE usage_credits (
    id TEXT PRIMARY KEY DEFAULT Nanoid('usage_credit'),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,

    credit_type TEXT NOT NULL,                          -- e.g., 'granted_promo', 'granted_goodwill', 'payment_top_up', 'payment_period_settlement', 'subscription_periodic_grant'
    source_reference_id TEXT,                           -- For payment-derived credits, this will be the Invoice.id that was paid. For others, e.g., promo_code_id, admin_user_id, subscription_id (for initial grants).
    
    billing_period_id TEXT REFERENCES billing_periods(id), -- Optional: If set, this credit is scoped to this billing period (common for subscription_periodic_grant).
    usage_meter_id TEXT REFERENCES usage_meters(id),    -- Optional: For meter-specific credits.

    issued_amount INTEGER NOT NULL,                     -- The original, immutable value of this credit grant.

    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,                -- Nullable, if the credit grant has an expiration date.

    initial_status TEXT NOT NULL,                       -- e.g., 'pending_payment_confirmation' (for payment-derived), 'granted_active' (for others). Status at time of grant.
    notes TEXT,
    metadata JSONB,                                     -- For storing flexible, contextual, non-indexed information.

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- Should only be for non-financial metadata or system flags, not for amount/core status.
);

-- Indexes (similar to previous version, add source_reference_id if queried often)
CREATE INDEX idx_usage_credits_subscription_id ON usage_credits(subscription_id);
CREATE INDEX idx_usage_credits_organization_id ON usage_credits(organization_id);
CREATE INDEX idx_usage_credits_expires_at ON usage_credits(expires_at);
```

**Zod Schema (`usageCredits.ts`):**
*   Define `usageCredits` Drizzle schema, reflecting immutability of core financial fields. Include the new `metadata` field.

### 1.2. `UsageCreditBalanceAdjustments` Table (Record of Administrative Adjustments to Granted Credits)

This table records explicit administrative actions to change the effective value of a previously granted credit (e.g., clawbacks, corrections of grant errors).

```sql
CREATE TABLE usage_credit_balance_adjustments (
    id TEXT PRIMARY KEY DEFAULT Nanoid('ucba'),
    adjusted_usage_credit_id TEXT NOT NULL REFERENCES usage_credits(id), -- The specific credit grant being targeted.
    adjustment_type TEXT NOT NULL,                      -- e.g., 'clawback_error', 'clawback_terms_violation', 'admin_reduction', 'grant_correction'
    amount_adjusted INTEGER NOT NULL,                   -- Positive value representing the amount being effectively removed/added to the grant's potential.
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
CREATE INDEX idx_ucba_adjusted_usage_credit_id ON usage_credit_balance_adjustments(adjusted_usage_credit_id);
```

**Zod Schema (`usageCreditBalanceAdjustments.ts`):**
*   Define schema for this new table. Include the new `metadata` field.

### 1.3. `UsageCreditApplications` Table (Itemized Use of Granted Credits)

This table stores an immutable record for each instance a portion (or all) of a `UsageCredits` grant is applied to offset usage costs during a calculation run. This provides itemized deduction tracking.

```sql
CREATE TABLE usage_credit_applications (
    id TEXT PRIMARY KEY DEFAULT Nanoid('usage_credit_app'),
    usage_credit_id TEXT NOT NULL REFERENCES usage_credits(id), -- FK to the credit grant that was applied.
    calculation_run_id TEXT NOT NULL,                     -- Links to calculation_run_id in subscription_meter_period_calculations.
    amount_applied INTEGER NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    target_usage_meter_id TEXT REFERENCES usage_meters(id), -- Optional: Specific meter this application offset.
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Indexes (as previously discussed)
CREATE INDEX idx_usage_credit_app_credit_id ON usage_credit_applications(usage_credit_id);
CREATE INDEX idx_usage_credit_app_calc_run_id ON usage_credit_applications(calculation_run_id);
```

**Zod Schema (`usageCreditApplications.ts`):**
*   Define schema for this new table.

### New Table: `LedgerTransactions` (Groups related ledger items)

This table creates a conceptual bundle for all ledger items that result from a single, distinct business operation or event. It provides a clear way to trace the full ledger impact of that originating event.

```sql
CREATE TABLE usage_transactions (
    id TEXT PRIMARY KEY DEFAULT Nanoid('utxn'),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    initiating_source_type TEXT,                        -- Optional: Describes what triggered this bundle (e.g., 'payment_confirmation', 'admin_credit_grant', 'billing_run_credit_application')
    initiating_source_id TEXT,                          -- Optional: The ID of the specific record that was the primary trigger (e.g., Payment.id, admin_user_id, calculation_run_id)
    description TEXT,                                   -- Optional: A human-readable description for the transaction bundle.
    metadata JSONB,                                     -- Optional: For any other contextual data related to the transaction bundle itself.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_utxn_initiating_source ON usage_transactions(initiating_source_type, initiating_source_id);
CREATE INDEX idx_utxn_organization_id ON usage_transactions(organization_id);
```

**Zod Schema (`ledgerTransactions.ts`):**
*   Define the Drizzle schema for this new `usage_transactions` table.

### New Table: `Refunds` (after UsageCreditApplications, before LedgerEntries)

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

### 1.4. `LedgerAccounts` Table (End Customer Credit Accounts - ECCA Focus)

This table stores distinct financial accounts. In the initial phase, its primary role is to represent **End Customer Credit Accounts (ECCAs)**, which track the balance of available usage credits for a specific End Customer's subscription.

*   **Purpose (Initial Focus):** Each ECCA record holds the usage credit balance for a subscription.
*   **Normal Balance:** For ECCAs, the `normal_balance` will consistently be `'credit'`.
    *   Granting/Issuing Credits: A `credit` entry to the ECCA increases the available credit balance.
    *   Applying/Using/Expiring/Clawing Back Credits: A `debit` entry to the ECCA decreases the available credit balance.
*   **Future Expansion:** This table is designed to potentially hold other account types in the future (e.g., merchant payables, detailed receivables) by using different `normal_balance` settings and interpretations.

```sql
-- Enum for normal balance (if not already defined elsewhere in your SQL schema setup)
-- CREATE TYPE normal_balance_type AS ENUM ('debit', 'credit');

CREATE TABLE ledger_accounts (
    id TEXT PRIMARY KEY DEFAULT Nanoid('la'), -- Or 'ecca' prefix for this phase
    organization_id TEXT NOT NULL REFERENCES organizations(id), -- The Merchant
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id), -- The End Customer's subscription
    usage_meter_id TEXT REFERENCES usage_meters(id),    -- Optional: if credits are meter-specific

    currency TEXT NOT NULL,                             -- E.g., 'USD', 'CREDIT_POINTS'. Defines the unit of the credit.
    normal_balance TEXT NOT NULL DEFAULT 'credit',      -- For ECCAs, this is 'credit'. Could be normal_balance_type ENUM.

    -- Cached sums for calculating available credits on the ECCA.
    -- These are updated atomically with every relevant LedgerEntry.
    posted_credits_sum TEXT NOT NULL DEFAULT '0',       -- Sum of all credits GRANTED and POSTED.
    posted_debits_sum TEXT NOT NULL DEFAULT '0',        -- Sum of all credits USED/APPLIED/CLAWED_BACK/EXPIRED and POSTED.
    pending_credits_sum TEXT NOT NULL DEFAULT '0',      -- Sum of all credits PENDING GRANT.
    pending_debits_sum TEXT NOT NULL DEFAULT '0',       -- Sum of all credits PENDING USAGE/APPLICATION/CLAWBACK/EXPIRATION.
    
    version INTEGER NOT NULL DEFAULT 0,                 -- For optimistic locking.

    livemode BOOLEAN NOT NULL,

    description TEXT,                                   -- Optional: e.g., "Usage Credits for Subscription XYZ"
    metadata JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_la_organization_id ON ledger_accounts(organization_id);
CREATE INDEX idx_la_subscription_id ON ledger_accounts(subscription_id);
-- Unique constraint for ECCA definition (one credit account per org/sub/meter/currency/livemode)
CREATE UNIQUE INDEX uq_ecca_definition
ON ledger_accounts (organization_id, subscription_id, usage_meter_id, currency, livemode);
```

**Zod Schema (`ledgerAccounts.ts`):**
*   Define the Drizzle schema for `ledger_accounts`, reflecting its ECCA focus initially.
*   Include fields for `organization_id`, `subscription_id`, `usage_meter_id`, `currency`, `normal_balance` (defaulting to `'credit'`), cached sum columns (`posted_credits_sum`, `posted_debits_sum`, `pending_credits_sum`, `pending_debits_sum`), `version`, `livemode`, and metadata.

### 1.5. `LedgerEntries` Table (The Grand Financial Journal)

This is the central, immutable, append-only ledger recording all financial events and value movements for a subscription. Every entry must be traceable to a source event/record and belong to a `LedgerTransaction`. `posted` entries are immutable. `pending` entries can be superseded using the `discarded_at` field during iterative calculations within a single operational context (e.g., a billing run) before being finalized as `posted`.

```sql
CREATE TABLE usage_ledger_items (
    id TEXT PRIMARY KEY DEFAULT Nanoid('uli'),
    usage_transaction_id TEXT NOT NULL REFERENCES usage_transactions(id), -- Groups ledger items from a single conceptual operation
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    entry_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Time of initial creation
    status TEXT NOT NULL,                               -- e.g., 'pending', 'posted'. 'posted' items are immutable.
    direction TEXT NOT NULL,                             -- 'debit' or 'credit'
    status TEXT NOT NULL, -- 'pending', or 'posted'
    entry_type TEXT NOT NULL,       -- e.g., 'usage_cost', 'payment_recognized', 'credit_grant_recognized', 'credit_applied_to_usage', 'credit_balance_adjusted', 'credit_grant_expired', 'billing_adjustment', 'payment_refunded'
    amount INTEGER NOT NULL,        -- Positive for credits/value-in, Negative for debits/value-out from subscription's perspective.
    description TEXT,
    discarded_at TIMESTAMP WITH TIME ZONE,              -- If set, this 'pending' entry was superseded by another within the same operational context. NULL for 'posted' items.

    -- Source linkage for traceability
    source_usage_event_id TEXT REFERENCES usage_events(id),                           
    source_usage_credit_id TEXT REFERENCES usage_credits(id),         
    source_payment_id TEXT REFERENCES payments(id),                                 
    source_credit_application_id TEXT REFERENCES usage_credit_applications(id),
    source_credit_balance_adjustment_id TEXT REFERENCES usage_credit_balance_adjustments(id),

    applied_to_ledger_item_id TEXT REFERENCES usage_ledger_items(id), -- e.g., a credit_applied_to_usage item linking to the usage_cost item it offsets.

    billing_period_id TEXT REFERENCES billing_periods(id), -- Nullable, for entries not tied to a specific period (e.g. evergreen top-ups)
    usage_meter_id TEXT REFERENCES usage_meters(id),    -- Nullable
    calculation_run_id TEXT,                            -- The batch process or specific operation run that generated this entry.
    metadata JSONB,                                     -- For storing flexible, contextual, non-indexed information.
    
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    livemode BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Indexes (ensure comprehensive indexing for querying by source_ids, entry_type, subscription_id, entry_timestamp)
CREATE INDEX idx_uli_subscription_id_timestamp ON usage_ledger_items(subscription_id, entry_timestamp);
CREATE INDEX idx_uli_entry_type ON usage_ledger_items(entry_type);
CREATE INDEX idx_uli_status_discarded_at ON usage_ledger_items(status, discarded_at); -- For querying active items
CREATE INDEX idx_uli_usage_transaction_id ON usage_ledger_items(usage_transaction_id); -- For grouping by transaction
-- Add indexes for all source_..._id columns that will be queried.
```

**Zod Schema (`ledgerEntriess.ts`):**
*   Define Drizzle schema. Include the new `metadata`, `status`, `discarded_at`, and `usage_transaction_id` fields. Add relevant validation logic (e.g., `discarded_at` can only be set if `status` is `'pending'`). `posted` items must have `discarded_at` as `NULL`.

### 1.6. `subscription_meter_period_calculations` Table (Append-Only Snapshots of Period Calculations)

This table stores an immutable snapshot for *each time* a calculation is performed and finalized for a specific usage meter within a subscription's billing period. Its values are derived from summarizing relevant `LedgerEntries` during a `calculation_run_id`.

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

*   **Core Principle:** All financial operations now revolve around creating immutable `LedgerEntries` which belong to a `LedgerTransaction`. `UsageCredits` records grants. `UsageCreditApplications` details the use of those grants. `UsageCreditBalanceAdjustments` records admin changes to grant effectiveness. `SubscriptionMeterPeriodCalculations` snapshots period outcomes based on *posted* (or to-be-posted) ledger activity.

*   **`billingRunHelpers.ts`:**
    1.  **Generate `calculation_run_id`**.
    2.  **Start a `LedgerTransaction`** for the current phase of the billing run (e.g., one for usage processing if it generates ledger items here, another for credit applications). Its `initiating_source_id` could be the `calculation_run_id` or subscription ID, `initiating_source_type` e.g. `'billing_run_usage_processing'` or `'billing_run_credit_application'`.
    3.  **Process `UsageEvents` for the period:** For each, ensure a `LedgerEntry` (`entry_type: 'usage_cost'`, status: `'posted'` if immediately final, or `'pending'` if part of the run's finalization) exists or is created, linked to the current `LedgerTransaction`.
    4.  **Apply Credits (from ECCA balance):**
        *   Identify applicable *active* `UsageCredits` grants by querying the ECCA balance or by specific grant properties (e.g., those expiring soonest if not using a simple FIFO on the ECCA).
        *   For each grant portion applied: Insert into `UsageCreditApplications`. Insert a `LedgerEntry` (`entry_type: 'credit_applied_to_usage'`, `status: 'pending'`, positive amount, linking to `source_usage_credit_id`, `source_credit_application_id`, and the current `LedgerTransaction`). If credit application logic iterates/revises within the run, existing `pending` items for this `LedgerTransaction` might be marked with `discarded_at`, and new `pending` items created (still linked to the same `LedgerTransaction`).
    5.  **Finalize Ledger Items for the Run:** At the end of processing for the `calculation_run_id` (and associated `LedgerTransaction`), all non-discarded `LedgerEntries` created with `status: 'pending'` during this run are transitioned to `status: 'posted'`.
    6.  **Generate `SubscriptionMeterPeriodCalculations` records:** Summarize the now `posted` ledger items (or those confirmed to be posted) for each meter for this `calculation_run_id` to populate these snapshot records. Manage `active`/`superseded` status.
    7.  Generate Invoices/Credit Notes based on the totals from these calculation snapshots. Invoices for standard billing cycles (post-paid usage, upcoming subscription period fees) are created here.

*   **Administrative Adjustment Processes (New):**
    1.  Record the intent in `UsageCreditBalanceAdjustments`.
    2.  Start a `LedgerTransaction` (e.g., `initiating_source_type='admin_adjustment'`, `initiating_source_id` = adjustment ID or admin user ID).
    3.  Create a `LedgerEntry` (`entry_type: 'credit_balance_adjusted'`, `status: 'posted'`, negative amount, linking to `source_credit_balance_adjustment_id`, the targeted `source_usage_credit_id`, and the `LedgerTransaction`).

*   **Payment Processing (Revised Flow - "Proactive PAYG Invoice" model or Standard Invoice Payment):**
    *   **A. For PAYG/Top-Up Scenarios (Customer Initiates Payment for Credits):**
        1.  Customer indicates intent to top-up and provides valid payment information.
        2.  System creates an `Invoice` (e.g., for "Account Top-Up," status `open`).
        3.  System creates a `Payment` record linked to this invoice (status `processing`) and initiates the charge with the gateway.
    *   **B. For Standard Invoice Scenarios (Merchant Bills Customer, Customer Pays):**
        1.  An `Invoice` is generated (e.g., by `billingRunHelpers.ts` for past usage or upcoming subscription period, status `open`).
        2.  Customer initiates payment for this invoice.
        3.  A `Payment` record is created linked to this invoice (status `processing`) and charge is initiated (if online) or payment is awaited (if offline like bank transfer).
    *   **C. On Successful `Payment` Confirmation (Common to A & B):**
        1.  Update `Payment.status` to `'succeeded'`.
        2.  Update the associated `Invoice.status` to `'paid'`.
        3.  Create a `UsageCredits` grant:
            *   `credit_type`: e.g., `'payment_top_up'` (for PAYG), `'payment_period_settlement'` (for standard invoice), or `'subscription_periodic_grant'` (if the invoice was for a plan that includes credits).
            *   `source_reference_id`: The `id` of the **`Invoice` record** that was paid by the successful `Payment`.
            *   `issued_amount`: The amount of credit granted (typically corresponding to the payment or a defined grant amount for a plan).
            *   `status`: `'granted_active'`.
            *   `expires_at`: As applicable (NULL for durable top-ups, end-of-period for monthly plan credits).
        4.  Start a `LedgerTransaction` (e.g., `initiating_source_type='payment_confirmation'`, `initiating_source_id` = `Payment.id` or `Invoice.id`).
        5.  Create a `LedgerEntry` (`entry_type: 'payment_recognized'` or `'credit_grant_recognized'`, status: `'posted'`, positive amount, linking to `source_payment_id`, the new `source_usage_credit_id`, and the `LedgerTransaction`). This credits the customer's ECCA.

## 3. Event Workflows and Ledger Posting

This section details the typical sequence of events, from an originating action to the creation of `LedgerEntries`. It also clarifies the immutability of core fields in the backing parent records that source these ledger entries.

### 3.0 Guiding Principles for Ledger Operations

Before detailing specific event flows, the following principles guide ledger operations to ensure robustness, auditability, and clarity:

*   **Idempotency:** All external write operations that result in the creation of financial records (e.g., initiating payments, granting credits via API, processing webhook-driven events like payment confirmations or usage event ingestion) should ideally support an idempotency key provided by the client or initiating system. This key allows the system to safely retry operations without risk of duplicate record creation. While not all V1 interfaces may expose this immediately, the underlying services should be designed with idempotency in mind for future-proofing. Operations that create `UsageCredits`, `UsageCreditBalanceAdjustments`, or direct `LedgerEntries` from external triggers are key candidates for this.

*   **Timestamp Conventions:** Clarity in timestamps is crucial for accurate financial record-keeping and auditability.
    *   `LedgerEntries.entry_timestamp`: This timestamp (defaulting to `CURRENT_TIMESTAMP` upon record creation) represents when the ledger item was created *in our system*. It does not change if the item's `status` changes or `discarded_at` is set.
    *   `LedgerEntries.discarded_at`: If a `pending` ledger item is superseded, this timestamp marks when that occurred.
    *   `Effective Event Time`: For understanding when the financial event *actually occurred* in the real world or source system (which may differ from when it was recorded in our ledger), queries should join back to the source record's own timestamp. Examples include `UsageEvents.event_timestamp` (for usage costs), `Payments.processed_at` (for payment recognitions), or `UsageCredits.issued_at` (for credit grants).
    *   System documentation should clearly outline these conventions for all relevant timestamps across financial tables to ensure consistent interpretation.

    *   **Understanding `calculation_run_id`:** This identifier is crucial for tracing and grouping records related to a specific execution instance of a calculation or billing process.
        *   **Nature:** It's a unique ID (e.g., UUID, Nanoid) generated by the application at the start of a distinct operational job (e.g., a nightly billing run, an ad-hoc recalculation, a credit application batch).
        *   **Usage as a Common Thread:** It acts as a "batch identifier," linking all records created or significantly affected during that single, specific operational run.
        *   **In `subscription_meter_period_calculations`:** Here, `calculation_run_id` (marked `UNIQUE`) uniquely identifies the summary snapshot record produced by that specific run.
        *   **In `usage_ledger_items` and `usage_credit_applications`:** A `calculation_run_id` (nullable in ledger items) tags records that were generated *as part of* that specific calculation run. For example, usage cost ledger items and credit application ledger items created during `run-xyz` would all carry this ID.
        *   **Not Typically a Direct Foreign Key (from ledger items to summary):** Generally, `usage_ledger_items.calculation_run_id` (or from `usage_credit_applications`) is *not* an enforced foreign key to `subscription_meter_period_calculations.calculation_run_id`. This is primarily due to the order of operations: ledger items are created *during* the run, while the `subscription_meter_period_calculations` summary record (which often summarizes these very items) is finalized and saved *at the end* of the run. Enforcing an FK would create a circular dependency in the process flow. Integrity is typically maintained at the application logic level by ensuring consistent tagging.

*   **Use of `metadata` fields:** Key financial tables (`UsageCredits`, `UsageCreditBalanceAdjustments`, `LedgerEntries`) now include a `metadata JSONB` field. This field is intended for storing flexible, contextual, non-indexed information relevant to the specific record. Examples include related entity IDs not suitable for foreign keys (e.g., a specific promotion campaign ID for a credit grant), system actor details (e.g., `'system:webhook_processor'`), diagnostic information, or any other pertinent data that aids in auditing or understanding the context of the record without requiring frequent schema changes.

*   **Lifecycle of `LedgerEntries`:**
    *   **Creation:** Ledger items can be created with `status = 'pending'` or `status = 'posted'`.
        *   `'pending'`: Typically used for items generated during iterative or multi-step processes (e.g., credit applications within a billing run). These items are not yet considered final.
        *   `'posted'`: Used for items representing immediately final financial events (e.g., a direct administrative adjustment, a payment recognition, or a usage cost processed individually and finalized).
    *   **Superseding Pending Items:** If a `pending` item needs to be amended or replaced *within the same operational context* (e.g., due to recalculation of credit use within a single `calculation_run_id`), the original `pending` item has its `discarded_at` field set to the current timestamp. A new `pending` item is then created with the corrected information. This avoids polluting the ledger with many intermediate reversal entries for non-finalized states.
    *   **Finalization (Posting):** Once an operational process concludes (e.g., a billing run is complete and its `SubscriptionMeterPeriodCalculations` record is finalized), all `pending` `LedgerEntries` associated with that operation (and not marked `discarded_at`) are transitioned to `status = 'posted'`.
    *   **Immutability of Posted Items:** Once a `LedgerEntry` has `status = 'posted'`, it is considered immutable. Its financial fields (`amount`, `currency`, `entry_type`, source links) must not change. `discarded_at` must be `NULL` for `posted` items.
    *   **Correcting Posted Items:** If a `posted` ledger item is found to be financially incorrect (e.g., due to an error in its immutable backing record or a change in business policy requiring retroactive adjustment), the correction is made by creating *new* `LedgerEntries` (e.g., of type `'billing_adjustment'` or `'credit_balance_adjusted'`) that counteract or amend the financial impact. The original `posted` item remains untouched.
    *   **Balance Calculation:** Accurate financial balances are typically derived from `SUM(amount)` of `LedgerEntries` where `status = 'posted'`, OR (`status = 'pending'` AND `discarded_at IS NULL`). Reporting may differentiate between "posted balance" and "pending/provisional balance."

*   **Comprehensive Transaction Management for Ledger and Event Atomicity:**
    *   **Unified Operations:** To ensure that primary business operations, the creation of their associated immutable `LedgerEntries`, and the logging of idempotent `Events` occur atomically, we utilize comprehensive transaction wrappers (e.g., `comprehensiveAdminTransaction`, `comprehensiveAuthenticatedTransaction`).
    *   **Side Effects within Transactions:** These wrappers allow a primary function (e.g., creating a `UsageCredits` grant, processing a payment) to return not only its core result but also a `ledgerCommand` and/or `eventsToLog`. The transaction wrapper then ensures these side effects are processed within the same database transaction as the main operation.
    *   **Deriving Ledger Entries from Backing Records:** The `ledgerCommand` contains "backing records" (e.g., the `UsageCredits` record that was just created, a `Payment` record, etc.). These backing records are the ground-truth source for generating the corresponding `LedgerEntries`.
    *   **Centralized Mapping Logic (`ledgerManager.ts`):** The `ledgerManager.ts` module is responsible for interpreting these backing records and applying the defined business logic to map them to one or more `LedgerEntry.Insert` objects. This centralizes the rules for how different financial events translate into specific ledger postings (e.g., what `entry_type`, `direction`, `amount`, and source links are appropriate for a `UsageCredits` grant of type `'payment_top_up'`).
    *   **Auditability and Traceability:** This approach maintains full auditability. The `LedgerTransaction` groups all ledger items stemming from a single operation, and each `LedgerEntry` can be traced back to its `LedgerTransaction` and, through the logic in `ledgerManager.ts` and source linkage fields, to its originating backing record(s). The idempotent events logged provide an additional layer of auditable system activity.

### 3.1. Backing Parent Records: Immutability

Once a backing parent record is created and represents a factual financial event, its core attributes defining that event should be immutable. The `updated_at` timestamp may change for system reasons or non-critical metadata, but not the financial facts.

*   **`UsageEvents`** (Assumed Schema - defined elsewhere)
    *   Immutable Core Fields: `id`, `subscription_id`, `organization_id`, `event_timestamp`, `meter_id`, `quantity`, `properties_for_pricing`, `idempotency_key`.
*   **`Payments`** (Assumed Schema - defined elsewhere)
    *   Immutable Core Fields (post-confirmation of a terminal state like 'succeeded' or 'failed'): `id`, `subscription_id`, `organization_id`, `amount`, `currency`, `status` (terminal status), `payment_method_details`, `transaction_id_from_processor`, `processed_at`.
*   **`UsageCredits`**
    *   Immutable Core Fields: `id`, `subscription_id`, `organization_id`, `livemode`, `credit_type`, `source_reference_id`, `billing_period_id` (if set at creation), `usage_meter_id` (if set at creation), `issued_amount`, `currency`, `issued_at`, `expires_at` (if set at creation), `initial_status`.
*   **`UsageCreditBalanceAdjustments`**
    *   Immutable Core Fields: `id`, `adjusted_usage_credit_id`, `adjustment_type`, `amount_adjusted`, `currency`, `reason`, `adjusted_by_user_id`, `adjustment_initiated_at`, `organization_id`, `livemode`.
*   **`UsageCreditApplications`**
    *   Immutable Core Fields: `id`, `usage_credit_id`, `calculation_run_id`, `amount_applied`, `currency`, `applied_at`, `target_usage_meter_id`, `organization_id`, `livemode`.

### 3.2. Event-to-Ledger Workflows

All workflows operate within database transactions to ensure atomicity. Each distinct business operation that creates ledger items will first create a `LedgerTransaction` record, to which all resulting `LedgerEntries` will be linked.

1.  **Usage Event Ingestion & Processing**
    *   **Event:** A `UsageEvent` is successfully ingested and validated for a subscription.
    *   **Transaction & Ledger Posting:**
        *   Create one `LedgerTransaction` (e.g., `initiating_source_type='usage_event_processing'`, `initiating_source_id`=UsageEvent.id).
        *   Create one `LedgerEntry` (linked to the LedgerTransaction):
            *   `entry_type`: `'usage_cost'`
            *   `status`: `'posted'` (assuming immediate finality; or `'pending'` if part of a batch processed later).
            *   `amount`: Negative value representing the calculated cost of the usage (pricing logic applied here).
            *   `currency`: Currency of the usage cost.
            *   `description`: e.g., "Usage for meter X on YYYY-MM-DD".
            *   `source_usage_event_id`: The `id` of the `UsageEvent`.
            *   `subscription_id`, `organization_id`, `livemode`, `billing_period_id` (if applicable), `usage_meter_id`.
    *   **Parent Record Creation (`UsageCredits`):**
        *   Create one `UsageCredits` record:
            *   `credit_type`: `'payment_top_up'` (for PAYG) or `'payment_period_settlement'` (for invoice payment).
            *   `source_reference_id`: The `id` of the successful `Payment` record.
            *   `issued_amount`: The amount of the confirmed payment.
            *   `currency`: Payment currency.
            *   `initial_status`: `'granted_active'`. 
            *   `subscription_id`, `organization_id`, `livemode`, `issued_at` (timestamp of confirmation).
    *   **Transaction & Ledger Posting:**
        *   Create one `LedgerTransaction` (e.g., `initiating_source_type='payment_confirmation'`, `initiating_source_id`=Payment.id).
        *   Create one `LedgerEntry` (linked to the LedgerTransaction):
            *   `entry_type`: `'payment_recognized'`
            *   `status`: `'posted'`
            *   `amount`: Positive value of the payment.
            *   `currency`: Payment currency.
            *   `description`: e.g., "Payment received via card ending XXXX".
            *   `source_payment_id`: The `id` of the `Payment` record.
            *   `source_usage_credit_id`: The `id` of the newly created `UsageCredits` record.
            *   `subscription_id`, `organization_id`, `livemode`.

2.  **Granting Promotional or Goodwill Credits**
    *   **Event:** An administrative action or automated process decides to grant a non-payment credit.
    *   **Transaction Context:** This typically happens within a broader `LedgerTransaction` associated with the current billing run's credit application phase (e.g., `initiating_source_type='billing_run_credit_application'`, `initiating_source_id`=calculation_run_id).
    *   **Parent Record Creation (`UsageCredits`):**
        *   Create one `UsageCredits` record:
            *   `credit_type`: e.g., `'granted_promo'`, `'granted_goodwill'`. 
            *   `source_reference_id`: e.g., `promo_code_id`, internal campaign ID, or `admin_user_id` initiating the grant.
            *   `issued_amount`: The amount of the credit being granted.
            *   `currency`: Credit currency.
            *   `initial_status`: `'granted_active'`.
            *   `expires_at`: (Optional) If the grant has an expiration date.
            *   `subscription_id`, `organization_id`, `livemode`, `issued_at`.
    *   **Transaction & Ledger Posting:**
        *   Create one `LedgerTransaction` (e.g., `initiating_source_type='promo_grant'`, `initiating_source_id`=promo_code_id or admin_user_id).
        *   Create one `LedgerEntry` (linked to the LedgerTransaction):
            *   `entry_type`: `'credit_grant_recognized'`
            *   `status`: `'posted'`
            *   `amount`: Positive value of the granted credit.
            *   `currency`: Credit currency.
            *   `description`: e.g., "Promotional credit APPSUMO2024 applied".
            *   `source_usage_credit_id`: The `id` of the newly created `UsageCredits` record.
            *   `subscription_id`, `organization_id`, `livemode`.

3.  **Applying Credits to Usage (During Billing Run or Real-time for PAYG)**
    *   **Event:** The system (e.g., billing run logic with `calculation_run_id`) identifies an applicable `UsageCredits` grant and decides to use a portion (or all) of it to offset accumulated `usage_cost` ledger items.
    *   **Transaction Context:** This typically happens within a broader `LedgerTransaction` associated with the current billing run's credit application phase (e.g., `initiating_source_type='billing_run_credit_application'`, `initiating_source_id`=calculation_run_id).
    *   **Parent Record Creation (`UsageCreditApplications`):**
        *   Create one `UsageCreditApplications` record for each distinct grant application:
            *   `usage_credit_id`: The `id` of the `UsageCredits` grant being applied.
            *   `amount_applied`: The portion of the credit grant being used in this instance.
            *   `currency`: Credit currency.
            *   `calculation_run_id`: (If applicable, e.g., during a billing run) The ID of the calculation process.
            *   `applied_at`, `target_usage_meter_id` (optional), `organization_id`, `livemode`.
    *   **Ledger Posting (within the existing LedgerTransaction for the run):**
        *   Create one `LedgerEntry` (linked to the LedgerTransaction):
            *   `entry_type`: `'credit_applied_to_usage'`
            *   `status`: `'pending'` (will be transitioned to `'posted'` at the end of the `calculation_run_id` if not discarded).
            *   `amount`: Positive value of the credit amount being applied (acts as an offset).
            *   `currency`: Credit currency.
            *   `description`: e.g., "Credit from grant X applied to usage in billing period Y".
            *   `source_usage_credit_id`: The `id` of the `UsageCredits` grant used.
            *   `source_credit_application_id`: The `id` of the new `UsageCreditApplications` record.
            *   `applied_to_ledger_item_id`: (Optional, but good practice for direct linking) Could link to a specific `usage_cost` ledger item or a summary ledger item for the period's usage if such an item exists.
            *   `subscription_id`, `organization_id`, `livemode`, `billing_period_id` (if applicable), `usage_meter_id` (if applicable).

4.  **Administrative Adjustment of Credit Balance (e.g., Clawback of a Granted Credit)**
    *   **Event:** An administrative decision is made to reduce the effective value of a previously issued `UsageCredits` grant (e.g., error in grant, terms violation).
    *   **Transaction Context:** The creation of a `UsageCreditBalanceAdjustments` record should be part of a `LedgerTransaction`.
    *   **Parent Record Creation (`UsageCreditBalanceAdjustments`):**
        *   Create one `UsageCreditBalanceAdjustments` record:
            *   `adjusted_usage_credit_id`: The `id` of the `UsageCredits` grant being adjusted.
            *   `adjustment_type`: e.g., `'clawback_error'`, `'admin_reduction'`. 
            *   `amount_adjusted`: Positive value representing the amount by which the original grant's utility is being reduced.
            *   `currency`: Currency of the adjustment.
            *   `reason`: Textual reason for adjustment.
            *   `adjusted_by_user_id`, `adjustment_initiated_at`, `organization_id`, `livemode`.
    *   **Ledger Posting (within a LedgerTransaction):**
        *   Create one `LedgerEntry` (linked to the LedgerTransaction):
            *   `entry_type`: `'credit_balance_adjusted'`
            *   `status`: `'posted'`
            *   `amount`: Negative value representing the reduction in credit value.
            *   `currency`: Adjustment currency.
            *   `description`: e.g., "Clawback of credit grant X due to Y".
            *   `source_credit_balance_adjustment_id`: The `id` of the new `UsageCreditBalanceAdjustments` record.
            *   `source_usage_credit_id`: The `id` of the `UsageCredits` grant that was targeted by the adjustment.
            *   `subscription_id`, `organization_id`, `livemode`.

5.  **Credit Grant Expiration**
    *   **Primary Mechanism (Point of Evaluation):** Expiration is primarily enforced when the system attempts to evaluate or apply credits (e.g., during a billing run, balance check, or real-time application).
        *   **Event:** Logic evaluating `UsageCredits` for applicability (e.g., in `billingRunHelpers.ts` or a credit application service) encounters a grant where `expires_at` is in the past.
        *   **Transaction Context:** The creation of a `'credit_grant_expired'` ledger item should be part of a `LedgerTransaction`. This might be a dedicated transaction for expiration processing (e.g., `initiating_source_type='credit_expiration_processing'`) or part of the transaction of the evaluating process (e.g., billing run).
        *   **Ledger Posting (within a LedgerTransaction):**
            *   Calculate the unused portion: `UsageCredits.issued_amount - SUM(UsageCreditApplications.amount_applied where usage_credit_id = expired_grant.id up to the point of expiration)`.
            *   Create one `LedgerEntry` (if unused portion > 0 and no existing expiration entry for this grant, linked to the LedgerTransaction):
                *   `entry_type`: `'credit_grant_expired'`
                *   `status`: `'posted'`
                *   `amount`: Negative value of the unused, expired portion of the credit.
                *   `currency`: Currency of the credit grant.
                *   `description`: e.g., "Credit grant X expired with Y unused amount as of [expiration_timestamp]".
                *   `source_usage_credit_id`: The `id` of the expired `UsageCredits` grant.
                *   `subscription_id`, `organization_id`, `livemode`.
                *   `entry_timestamp`: Should ideally reflect the time of evaluation or, if by batch, the time the batch recognized it. The effective financial impact is from `expires_at`.
    *   **Secondary Mechanism (Optional Housekeeping):**
        *   A periodic system process (e.g., daily batch job) can sweep for `UsageCredits` grants where `expires_at` has passed and no corresponding `'credit_grant_expired'` ledger item exists. This job would then create the necessary ledger items as described above. This ensures eventual consistency in the ledger for credits that might not have been evaluated recently around their expiry.

6.  **Payment Refund Processing**
    *   **Event:** A refund is initiated for a specific, previously successful `Payment`.
    *   **Transaction Context:** The creation of a `Refunds` record should be part of a `LedgerTransaction`.
    *   **Parent Record Creation (`Refunds`):**
        *   Create one `Refunds` record:
            *   `payment_id`: The `id` of the original `Payment` being refunded.
            *   `amount`, `currency`: The amount and currency of the refund.
            *   `status`: Initially `'pending'` (or as appropriate for gateway interaction).
            *   `reason`, `initiated_by_user_id`, `subscription_id`, `organization_id`, `livemode`.
    *   **(Process refund with payment gateway)**
    *   **On Refund Confirmation (Successful from Gateway):**
        *   Update `Refunds` record: Set `status` to `'succeeded'`, store `refund_processed_at`, `gateway_refund_id`.
        *   **Transaction & Ledger Posting:**
            *   Create one `LedgerTransaction` (e.g., `initiating_source_type='payment_refund'`, `initiating_source_id`=Refunds.id).
            *   Create one `LedgerEntry` (linked to the LedgerTransaction):
                *   `entry_type`: `'payment_refunded'`
                *   `status`: `'posted'`
                *   `amount`: **Negative value** equal to the refunded amount.
                *   `currency`: Refund currency.
                *   `description`: e.g., "Refund for original payment ID [Payment.id]".
                *   `source_payment_id`: The `id` of the original `Payment` record.
                *   `source_refund_id`: The `id` of the new `Refunds` record from this workflow step.
                *   `subscription_id`, `organization_id`, `livemode`.
    *   **Consideration for Associated Credits:** If the original payment funded a `UsageCredits` grant, the posting of the `'payment_refunded'` ledger item correctly adjusts the subscription's overall balance. A secondary, optional step could be to create a `UsageCreditBalanceAdjustments` entry to administratively reduce or invalidate the unspent portion of the original `UsageCredits` grant, further clarifying that its funding was revoked. This would generate an additional `'credit_balance_adjusted'` ledger item.

7.  **Billing Recalculation and Adjustment**
    *   **Event:** A recalculation is triggered for a specific billing period (e.g., due to corrected usage data, retroactive price changes, or fixing a previous calculation error). This results in a new `subscription_meter_period_calculations` record (`SMPC_new`) for that period, which supersedes a previous one (`SMPC_old`). The `SMPC_old.status` is updated to `'superseded'`, and `SMPC_old.superseded_by_calculation_id` points to `SMPC_new.id`.
    *   **Transaction Context:** The creation of a new `subscription_meter_period_calculations` record should be part of a `LedgerTransaction`.
    *   **Parent Record Linkage:** The primary source record for the ledger item is the new `subscription_meter_period_calculations` record (`SMPC_new`).
    *   **Transaction & Ledger Posting (to reflect the *net change* from the recalculation):**
        *   Create one `LedgerTransaction` (e.g., `initiating_source_type='billing_recalculation'`, `initiating_source_id`=SMPC_new.calculation_run_id).
        *   Create one `LedgerEntry` (linked to the LedgerTransaction):
            *   `entry_type`: `'billing_adjustment'`
            *   `status`: `'posted'`
            *   `amount`: The difference in the `net_billed_amount` between `SMPC_new` and `SMPC_old`. (i.e., `SMPC_new.net_billed_amount - SMPC_old.net_billed_amount`). This can be positive (if the new calculation results in a higher charge) or negative (if it results in a lower charge or a credit).
            *   `currency`: The billing currency for the period.
            *   `description`: e.g., "Billing adjustment due to recalculation [SMPC_new.id] for period [billing_period_id], superseding [SMPC_old.id]".
            *   `source_billing_period_calculation_id`: The `id` of `SMPC_new`.
            *   `calculation_run_id`: The `calculation_run_id` associated with the recalculation process that generated `SMPC_new`.
            *   `billing_period_id`: The `id` of the billing period being adjusted.
            *   `subscription_id`, `organization_id`, `livemode`.

## Answered Questions from Previous Discussions

1.  **Q: How do we aggregate credits scoped to a billing period vs to a whole run (evergreen)?**
    *   **A:** The `UsageCredits` table has an optional `billing_period_id`. When applying credits, the application logic (e.g., in a billing run) will query for relevant credits, prioritizing those scoped to the current `billing_period_id` before considering evergreen credits (where `billing_period_id` is NULL). The `LedgerEntries` created for credit applications will reflect which grant was used, and the `UsageCreditApplications` table also records this link.

2.  **Q: Is the ledger going to run across the lifetime of the subscription?**
    *   **A:** Yes. `LedgerEntries` are associated with a `subscription_id` and are not inherently limited by billing periods (though many entries will have a `billing_period_id` for attribution). This allows for a continuous financial history for the subscription, accommodating both temporal billing periods and ongoing PAYG/wallet models.

3.  **Q: For payment associated ledger items, how do we post them? Do we post them when the payment has been created, and mark them as unsettled until the payment is confirmed?**
    *   **A:** A `UsageCredits` record is created with an `initial_status` like `'pending_payment_confirmation'` when a payment process starts. The corresponding `'payment_recognized'` entry in `LedgerEntries` (which makes the value spendable by the system) and the update of the `UsageCredits` grant to an active/available state should only occur *after* the payment is confirmed (e.g., webhook received, payment status becomes 'succeeded'). If a payment fails, the `UsageCredits` grant reflects this (e.g., status `'payment_failed_voided'` or similar, or it's never activated), and no positive ledger entry for a recognized payment is created, or a counteracting one is posted if an initial pending entry was made.

4.  **Q: Do we want a settlement status on the `LedgerEntries`? Or is posting on the ledger the equivalent of settlement? What is the best practice for double entry ledgers - do the items have statuses?**
    *   **A (Revised):** `LedgerEntries` will now have a `status` field (e.g., `'pending'`, `'posted'`).
        *   `'pending'` items represent provisional financial impacts that are subject to change or supersession (via `discarded_at`) within an ongoing operational context (like a billing run). They are not yet considered final for official balance reporting.
        *   `'posted'` items represent finalized, immutable financial facts. These are used for definitive balance calculations and official financial reporting.
        *   "Settlement" of a debit (like a `'usage_cost'`) is still a derived concept: it's effectively settled when offset by corresponding `posted` positive-amount ledger items (like `'credit_applied_to_usage'` or `'payment_recognized'`). The `status` field helps manage the lifecycle leading up to an item being considered for such settlement.

5.  **Q: How do we ensure atomicity when, for example, an adjustment involves creating a `UsageCreditBalanceAdjustments` record AND a `LedgerEntries` record, or when a billing run inserts multiple ledger items and updates `SubscriptionMeterPeriodCalculations`?**
    *   **A:** All related database operations for a single logical event (like an adjustment or a billing run's processing for one period) must occur within a single database transaction. Furthermore, each distinct business operation that creates ledger items will first create a `LedgerTransaction` record, to which all resulting `LedgerEntries` will be linked. This combination ensures both atomicity at the database level and logical grouping for auditability and traceability. The specific transaction boundaries for different processes (billing run, PAYG real-time application, administrative adjustments) will be carefully defined and implemented in the application logic.

6.  **Q: Why do we still need `UsageCredits` and `UsageCreditApplications` if we have `LedgerAccounts` to track balances and `LedgerTransactions` to trace provenance?**
    *   **A:** This is a crucial design point. While `LedgerAccounts` (like an End Customer Credit Account - ECCA) provide the current spendable balance and `LedgerTransactions` bundle the operational ledger entries, `UsageCredits` and `UsageCreditApplications` serve distinct, vital roles:
        *   **`UsageCredits` defines the "credit grant" or "credit parcel" itself:**
            *   **Identity and Terms:** It stores the original `issued_amount`, the specific `credit_type` (e.g., `'granted_promo'`, `'payment_top_up'`), any `expires_at` date, the `source_reference_id` (origin of the grant, e.g., an `Invoice.id` for payment-derived credits, or a `PromoCode.id` for promotional grants), and potential scoping to `billing_period_id` or `usage_meter_id`.
            *   **Lifecycle:** Tracks `initial_status` (e.g., `'pending_payment_confirmation'` - though with the proactive invoice model, credits are typically created as `'granted_active'` post-payment).
            *   **Necessity:** Without it, you cannot distinguish between different grants (e.g., a $50 promo expiring soon vs. a $200 non-expiring paid credit when the `LedgerAccount` just shows a $250 balance). Querying for specific grant types or managing expirations becomes very difficult. It acts as the authoritative record for these "credit parcels."
        *   **`UsageCreditApplications` records the itemized use of specific grants:**
            *   **Explicit Linkage:** It shows exactly which `UsageCredits` grant (via `usage_credit_id`) was drawn down, the `amount_applied`, and the `calculation_run_id` (context of application).
            *   **Backing Parent Record:** It serves as the "backing parent record" for `LedgerEntries` of type `'credit_applied_to_usage'`, detailing the "why" and "how" of that specific credit consumption.
            *   **Necessity:** If a customer has multiple grants, and their `LedgerAccount` is debited, `UsageCreditApplications` tells you *which* grant was used. This is essential for consumption rules (e.g., "use promo credits first"), accurately calculating remaining balances of *individual grants*, and providing clear audit trails.
            *   **In summary:**
                *   `LedgerAccounts` = Current balances.
                *   `LedgerTransactions` = Grouping of ledger entries for a business operation.
                *   `LedgerEntries` = The immutable financial journal.
                *   `UsageCredits` = Defines **what credit was granted and its terms**.
                *   `UsageCreditApplications` = Defines **how a specific granted credit was consumed**.
            These tables provide crucial details for operational logic, auditing, and customer transparency that are not inherently covered by ledger accounts or transactions alone.

7.  **Q: Should `UsageCredits` be granted at the `Payment` level or the `Invoice` level to best model the billing transition lifecycle?**
    *   **A (Revised):** `UsageCredits` that arise from a customer's monetary transaction should be linked to the **`Invoice`** that was settled by that payment. A `Payment` confirms that an `Invoice` (either for services rendered/billed or for a proactive credit purchase like a top-up) is `paid`. This "paid Invoice" event is then the trigger for creating/activating the associated `UsageCredits` grant.
        *   **Unified Sourcing for Payment-Derived Credits:** The `Invoice.id` becomes the consistent `source_reference_id` for `UsageCredits` grants originating from customer payments. This applies whether the invoice was for a standard billing cycle or proactively created for a PAYG/top-up scenario (as per the "Proactive PAYG Invoice" model).
        *   **`Payment` as the Catalyst:** The `Payment` is the crucial catalyst that moves an `Invoice` to a `paid` status.
        *   **Clarity of Grant Origin:** This model ensures that every payment-backed credit grant has a clear, itemized bill (the `Invoice`) associated with it, detailing what the payment was for (e.g., "January Subscription Services," "Account Top-Up").
        *   **Handles All Scenarios:**
            *   **Invoice Settlement:** A standard invoice is paid -> `UsageCredits` linked to this `Invoice.id`.
            *   **PAYG/Wallet Top-ups (Proactive Invoice Model):** Customer initiates top-up -> `Invoice` for "top-up" created -> `Payment` made against it -> `UsageCredits` linked to this `Invoice.id`.
        *   **Promotional/Non-Monetary Grants:** These would still have different `source_reference_id` types (e.g., `promo_code_id`, `subscription_id` for an initial trial grant) as they don't originate from a paid invoice.
        *   **Billing Lifecycle Clarity:**
            1. An `Invoice` is created (either proactively for a top-up, or for a standard billing cycle).
            2. Customer makes a `Payment` against this `Invoice`.
            3. The `Payment` is confirmed, and the `Invoice` is marked `paid`.
            4. A `UsageCredits` grant is created/activated, with `source_reference_id = Invoice.id`.
            5. A `LedgerEntry` posts the value of this grant to the customer's `LedgerAccount` (ECCA).
        *   This invoice-centric linkage for `UsageCredits` (when they are payment-derived) provides a robust foundation for tracking the lifecycle of credits from their financial origin.

## Open Questions for Further Design

1.  **Q: If the ledger tracks the lifetime of the subscription, how do we determine the aggregate balance, considering credit expirations?**
    *   **A (Refined):** The current aggregate balance of a subscription is `SUM(amount)` from all its `LedgerEntries`. When a `UsageCredits` grant (recorded in the `UsageCredits` table) expires, an immutable `LedgerEntries` entry (`entry_type: 'credit_grant_expired'`, with a negative amount equal to the then-unused portion of the grant, linked to the `source_usage_credit_id`) must be created. The unused portion is determined by `issued_amount - SUM(amount_applied from UsageCreditApplications for that grant)`. This ledger entry ensures the overall balance accurately reflects value lost due to expiration. The *process and frequency* of creating these `'credit_grant_expired'` ledger entries (e.g., daily batch job checking `expires_at` dates) needs to be defined.

2.  **Q: What kind of Zod schema constraints must we apply to the ledger items?**
    *   Beyond standard type/nullability: For `LedgerEntries`, Zod schemas should enforce conditional requirements for `source_..._id` fields based on `entry_type`. For example, if `entry_type` is `'usage_cost'`, then `source_usage_event_id` must be present. Referential integrity with `amount` signs (e.g., `'usage_cost'` is negative, `'payment_recognized'` is positive) should also be considered.

3.  **Q: Should the "payment" associated backing record for a `LedgerEntry` of type `'payment_recognized'` be the `Payment` record itself, or an `Invoice` it settles, or an `InvoiceLineItem`?**
    *   **Open Question:** The current design links `LedgerEntries` of `entry_type = 'payment_recognized'` to `source_payment_id` (the `Payments` table record) and `source_usage_credit_id` (the `UsageCredits` grant that the payment funded). The `Payment` record itself can be linked to an `Invoice`. This provides direct traceability to the payment. Is this sufficient, or is a more direct link from the ledger item to an `Invoice` (if the payment is for an invoice) also required or beneficial for certain reporting/querying scenarios? This needs further consideration based on reporting needs.

4.  **Q: For PAYG wallet models with real-time credit application, what are the performance implications of creating multiple ledger items per usage event (one for cost, one for credit application)?**
    *   **Open Question:** If usage event volume is extremely high, inserting 2+ ledger items per usage event in real-time might become a bottleneck. Strategies like micro-batching (e.g., aggregating usage costs and credit applications over a 1-minute window and then writing summarized ledger entries) might be needed. This requires evaluating expected load and benchmarking.

5.  **Q: Should we automatically run billing at the start of the subscription and not even allow the subscription to run at the end? This would allow us to create up-front credit grants without too much thought - and eliminate the need for us to defer running billing because we hadn't implemented usage yet.**
    *   **Open Question:** This needs to be discussed.

6.  **Q: When in the create subscription flow do we apply the credit grant items to the ledger accounts? Do we do so after the payment has settled? Before?**
    *   **Open Question:** This needs to be discussed.

This revised game plan focuses on an append-only, auditable ledger for all financial events and calculations, providing much greater resilience and clarity for adjustments and historical tracking across various subscription models.
