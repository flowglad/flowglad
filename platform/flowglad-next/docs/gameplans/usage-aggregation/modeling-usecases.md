# Modeling Use Cases for Usage Aggregation and Credits

This document outlines several common merchant scenarios and how they would be modeled using the defined database schema and workflows, focusing on `Invoices`, `Payments`, `UsageCredits`, `LedgerAccounts` (specifically the End Customer Credit Account - ECCA), `LedgerEntries`, and policy layers like `Credit Limits`.

The ECCA's effective balance is determined by `posted_credits_sum - posted_debits_sum`.
- A positive balance indicates pre-paid or available credits.
- A zero balance indicates no pre-payment or debt.
- A negative balance indicates debt owed by the customer for consumed services/overages.

## Scenario 1: Post-Paid Billing with Async Payment

**1. Scenario Description:**
A merchant signs a customer who will be billed at the end of a period for credits/services consumed during that period. The customer's payment process (e.g., bank transfer, card requiring 3DS) is asynchronous.

**2. Initial Setup:**
*   `Subscription`: Created for the customer, possibly with a defined billing cycle.
*   `LedgerAccount` (ECCA): Exists for the subscription. `posted_credits_sum = 0`, `posted_debits_sum = 0`. Effective balance = $0.
*   `Credit Limit`: A credit limit (e.g., $500) is set for the subscription, allowing the ECCA balance to go negative up to this amount due to usage.

**3. Workflow & Key Actions:**
    *   **a. Usage Occurs During Billing Period:**
        *   `UsageEvents` are recorded and priced.
        *   For each priced usage event/aggregate:
            *   `LedgerTransaction` created (e.g., `initiating_source_type='usage_event_processing'`).
            *   `LedgerEntry` created (type: `'usage_cost'`, status: `'posted'`, amount: negative value of usage cost, linked to `source_usage_event_id` and the `LedgerTransaction`). This increases ECCA's `posted_debits_sum`.
        *   ECCA effective balance becomes negative (e.g., -$150), reflecting accrued debt but still within the $500 credit limit.
    *   **b. End of Billing Period - Invoice Generation:**
        *   System calculates total charges for the period (e.g., by summarizing `usage_cost` ledger items or from `SubscriptionMeterPeriodCalculations`). Let's say total usage cost is $150.
        *   `Invoice` created for $150.
            *   Line items detail the services consumed.
            *   Status: `'open'`.
        *   (Merchant's general ledger: Accounts Receivable debited by $150).
    *   **c. Customer Initiates Asynchronous Payment:**
        *   Customer receives invoice and initiates payment (e.g., starts a bank transfer).
        *   Merchant creates a `Payment` record:
            *   Linked to the `Invoice.id`.
            *   `amount`: $150.
            *   `status`: `'processing'` or `'pending_confirmation'`.
    *   **d. Payment Confirmation (Asynchronous):**
        *   A webhook or notification confirms payment success.
        *   Update `Payment` record: `status = 'succeeded'`.
        *   Create `UsageCredits` record:
            *   `credit_type`: `'payment_period_settlement'`.
            *   `source_reference_id`: The `Invoice.id` that was paid.
            *   `issued_amount`: $150.
            *   `status`: `'granted_active'`.
        *   Create `LedgerTransaction` (e.g., `initiating_source_type='payment_confirmation'`, `initiating_source_id=Payment.id`).
        *   Create `LedgerEntry`:
            *   Type: `'payment_recognized'`.
            *   Status: `'posted'`.
            *   Amount: +$150.
            *   `source_payment_id`: The `Payment.id`.
            *   `source_usage_credit_id`: The new `UsageCredits.id`.
            *   This entry increases ECCA's `posted_credits_sum`.
        *   (Merchant's general ledger: Cash debited, Accounts Receivable credited).
    *   **e. Update `Invoice`:** `status = 'paid'`.

**4. Handling of Specific Conditions:**
    *   **Async Payment Failure:** If payment confirmation indicates failure:
        *   `Payment.status` becomes `'failed'`.
        *   `Invoice` remains `'open'`.
        *   ECCA balance remains negative.
        *   Dunning process initiated based on merchant policy. Service might be suspended if ECCA balance exceeds credit limit due to ongoing usage, or if the invoice remains unpaid past due dates.
    *   **Credit Limit Breach:** If at any point `(ECCA.posted_debits_sum - ECCA.posted_credits_sum) > CreditLimit`, service provisioning logic should block further usage or trigger alerts/actions as per policy.

**5. ECCA Balance Behavior:**
    *   Starts at $0.
    *   Goes negative as usage is recorded (e.g., -$150).
    *   Returns to $0 (or positive if there were prior credits/overpayment) after the `payment_recognized` ledger entry.


## Scenario 2: One-Time Free Grant, then Paid Subscription with Expiring Monthly Credits

**1. Scenario Description:**
A merchant offers new customers X usage credits for free. After these are used (or a trial period ends), customers must subscribe to a plan (e.g., $10 for 1000 credits/month). Unused monthly credits expire at the end of each billing period.

**2. Initial Setup:**
*   New `Customer` and `Subscription` created (status, e.g., `'trial'`).
*   `LedgerAccount` (ECCA): Exists. Balance $0.
*   `Credit Limit`: Could be $0 during the free grant phase if no overage is allowed, or a small amount.

**3. Workflow & Key Actions:**
    *   **a. Signup - Free Grant:**
        *   Create `UsageCredits` record:
            *   `credit_type`: `'signup_bonus'`.
            *   `issued_amount`: X (e.g., 200 credits).
            *   `status`: `'granted_active'`.
            *   `expires_at`: (Optional) e.g., 30 days from signup.
        *   Create `LedgerTransaction` (e.g., `initiating_source_type='promotional_grant'`).
        *   Create `LedgerEntry`:
            *   Type: `'promo_credit_recognized'`.
            *   Status: `'posted'`.
            *   Amount: +X credits.
            *   `source_usage_credit_id`: The new `UsageCredits.id`.
            *   ECCA's `posted_credits_sum` increases by X. Effective balance is +X.
    *   **b. Usage During Trial:**
        *   `UsageEvents` -> `usage_cost` `LedgerEntries` debit ECCA, reducing the balance from X towards 0.
    *   **c. Transition to Paid Subscription (Trial ends or credits exhausted):**
        *   Customer prompted to enter payment information.
        *   **First Paid Period (using Proactive Invoice model):**
            *   System is ready to charge (valid payment info provided).
            *   Create `Invoice`: For $10 (plan fee for "1000 credits/month"). Status `'open'`.
            *   Create `Payment`: Linked to invoice, amount $10, status `'processing'`.
            *   Initiate charge with gateway.
    *   **d. Payment Confirmation for First Paid Period:**
        *   If payment succeeds:
            *   `Payment.status` = `'succeeded'`.
            *   Create `UsageCredits` record:
                *   `credit_type`: `'subscription_periodic_grant'`.
                *   `issued_amount`: 1000 credits.
                *   `status`: `'granted_active'`.
                *   `source_reference_id`: The `Invoice.id`.
                *   `expires_at`: End of the current billing period.
            *   `LedgerTransaction` and `LedgerEntry` (type: `'payment_recognized'` or `'subscription_credit_recognized'`) credit ECCA by 1000.
            *   `Invoice.status` = `'paid'`.
            *   `Subscription.status` = `'active'`.
        *   If payment fails: `Invoice` remains `open`. `Payment.status` = `'failed'`. Customer prompted to update payment. No new credits granted.
    *   **e. Ongoing Monthly Cycle (Start of each new billing period):**
        *   Repeat steps 3c and 3d: Create Invoice for $10, process payment, on success grant new 1000 `UsageCredits` (with new `expires_at` for *this* period), credit ECCA.
    *   **f. Credit Expiration (End of each billing period):**
        *   Identify the specific `UsageCredits` grant that was for *this* billing period (e.g., `SELECT ... WHERE id = <this_period_grant_id> AND expires_at = <end_of_this_period>`).
        *   Calculate unused amount: `UsageCredits.issued_amount - SUM(UsageCreditApplications.amount_applied WHERE usage_credit_id = <this_period_grant_id>)`.
        *   If unused > 0:
            *   Create `LedgerTransaction` (e.g., `initiating_source_type='credit_expiration'`).
            *   Create `LedgerEntry`:
                *   Type: `'credit_grant_expired'`.
                *   Status: `'posted'`.
                *   Amount: Negative value of the unused credits.
                *   `source_usage_credit_id`: The `UsageCredits.id` of the expiring grant.
                *   This entry increases ECCA's `posted_debits_sum`, effectively removing the expired credit value.

**4. Handling of Specific Conditions:**
    *   Payment failure for a renewal prevents new monthly credits. Access might be suspended based on policy (e.g., if ECCA is $0 or negative and no grace period).

**5. ECCA Balance Behavior:**
    *   Starts at +X (free grant).
    *   Decreases with usage.
    *   Increases by 1000 upon successful monthly payment.
    *   Decreases by any unused, expired amount at period end.

## Scenario 3: PAYG Wallet with Durable, Non-Expiring Credits

**1. Scenario Description:**
A merchant offers a pay-as-you-go wallet. Customers top up their wallet, and these credits are durable (do not expire) and can be used for any service meter.

**2. Initial Setup:**
*   `Subscription`: Exists, possibly in a "PAYG" plan type.
*   `LedgerAccount` (ECCA): Exists. Balance $0.
*   `Credit Limit`: Typically $0 for strict PAYG (must have balance to use), or a very small operational buffer.

**3. Workflow & Key Actions:**
    *   **a. Customer Initiates Wallet Top-Up (Proactive PAYG Invoice model, constrained):**
        *   Customer selects top-up amount (e.g., $50).
        *   Customer provides valid payment information.
        *   System (once ready to charge):
            *   Create `Invoice`: For $50. Line item: "Wallet Top-Up". Status `'open'`.
            *   Create `Payment`: Linked to invoice, amount $50, status `'processing'`.
            *   Initiate charge with gateway.
    *   **b. Payment Confirmation:**
        *   If payment succeeds:
            *   `Payment.status` = `'succeeded'`.
            *   Create `UsageCredits` record:
                *   `credit_type`: `'payment_top_up'` or `'wallet_load'`.
                *   `issued_amount`: $50 (or equivalent credit units if priced differently).
                *   `status`: `'granted_active'`.
                *   `source_reference_id`: The `Invoice.id`.
                *   `expires_at`: `NULL` (durable credits).
            *   `LedgerTransaction` and `LedgerEntry` (type: `'payment_recognized'`) credit ECCA by $50.
            *   `Invoice.status` = `'paid'`.
        *   If payment fails:
            *   `Payment.status` = `'failed'`.
            *   `Invoice` remains `open` (or `payment_failed`). No credits added. Customer notified.
    *   **c. Usage:**
        *   Customer consumes services.
        *   `UsageEvents` -> `usage_cost` `LedgerEntries` debit ECCA.
        *   If ECCA balance (from durable credits) becomes $0, further usage is blocked unless a credit limit allows temporary negative balance (uncommon for pure PAYG wallet unless specifically designed).

**4. Handling of Specific Conditions:**
    *   Credits are durable: `UsageCredits.expires_at` is `NULL`. No expiration logic needed for these grants.
    *   Running out of balance: Service is typically cut off immediately if ECCA balance is $0 and credit limit is $0.

**5. ECCA Balance Behavior:**
    *   Starts at $0.
    *   Increases with each successful top-up (e.g., +$50, then +$20, total +$70).
    *   Decreases as services are consumed.

## Scenario 4: Monthly Plan with Expiring Credits + Overage (Potential for Spike & Payment Failure)

**1. Scenario Description:**
A customer is on a plan: $X for 1000 credits per billing period (these expire at period end). Usage beyond 1000 credits is charged as overage at the end of the period. A customer might have a usage spike causing significant overage, and their subsequent payment might fail.

**2. Initial Setup:**
*   `Subscription`: Active on the described plan.
*   `LedgerAccount` (ECCA): Exists. Balance reflects any carry-over or state from previous period.
*   `Credit Limit`: Set for the subscription (e.g., $200). This limit applies to how much *negative* the ECCA can go due to *overage usage* within a period *before* that overage is billed.

**3. Workflow & Key Actions:**
    *   **a. Start of Billing Period - Base Plan Credits:**
        *   (Proactive Invoice model) `Invoice` created for $X (base plan fee).
        *   Payment processed. On success:
            *   `UsageCredits` record created: 1000 credits, `credit_type='subscription_periodic_grant'`, `status='granted_active'`, `expires_at=end_of_current_period`, `source_reference_id=Invoice.id`.
            *   `LedgerEntry` (`payment_recognized`/`subscription_credit_recognized`) credits ECCA by 1000.
            *   `Invoice` for base fee is `paid`.
    *   **b. Usage During Period:**
        *   `UsageEvents` -> `usage_cost` `LedgerEntries` debit ECCA.
        *   These costs first consume the 1000 monthly credits.
    *   **c. Usage Exceeds 1000 Credits (Overage Incurred):**
        *   The 1000 granted monthly credits are exhausted.
        *   Further `usage_cost` `LedgerEntries` continue to debit ECCA. The ECCA balance now becomes negative, reflecting accrued overage debt (e.g., -$50).
    *   **d. Credit Limit Check During Usage Spike (Crucial):**
        *   Before authorizing any significant usage event (especially a potential "spike"):
            *   System checks: `(Current ECCA Balance * -1) < Configured Credit Limit`.
            *   (e.g., ECCA is -$50, Credit Limit is $200. Max further usage before hitting limit is $150).
            *   If spike would exceed limit (e.g., spike costs $160, ECCA would go to -$210):
                *   **Action (Policy-Driven):** Block usage, warn user, request top-up, or allow if policy for this customer is lenient (riskier).
    *   **e. End of Billing Period - Billing for Overage & Next Cycle:**
        *   **Credit Expiration:** Any unused part of the 1000 monthly credits (if any) expires. `LedgerEntry` (`credit_grant_expired`) debits ECCA.
        *   **Invoice Generation:** A single `Invoice` is created for:
            *   Item 1: Next month's base plan fee ($X for 1000 new credits).
            *   Item 2: Overage charge from the just-ended period (e.g., $50, which is the current negative ECCA balance related to usage).
            *   Total Invoice Amount = $X + $50. Status `'open'`.
        *   (Merchant's A/R is debited for $X + $50).
    *   **f. Payment Attempt for Combined Invoice:**
        *   System attempts to charge customer $X + $50.
        *   Create `Payment` record, status `'processing'`.
    *   **g. Payment Confirmation (The "Snag" - Handling Failure):**
        *   **If Payment Succeeds:**
            *   `Payment.status` = `'succeeded'`.
            *   New `UsageCredits` for next month's 1000 credits are granted (as in 3a), ECCA credited.
            *   *Additional* `UsageCredits` are effectively granted for the $50 overage paid (type `payment_overage_settlement`, `source_reference_id = Invoice.id`). The corresponding `LedgerEntry` (`payment_recognized`) credits the ECCA by $50, bringing the overage part of the balance back to zero.
            *   `Invoice` status `paid`.
        *   **If Payment Fails:**
            *   `Payment.status` = `'failed'`.
            *   `Invoice` (for $X + $50) remains `'open'`.
            *   **No new 1000 credits for the next period are granted.**
            *   ECCA balance remains negative from the prior period's overage (e.g., -$50), and now also reflects the unpaid base fee for the new period if A/R was posted.
            *   **Consequences (Policy-Driven):** Dunning process. Subscription likely suspended immediately or after a short grace period. No further usage allowed. Access blocked until outstanding amount is paid. The credit limit might be effectively $0 or ignored if service is fully cut.

**4. Handling of Specific Conditions:**
    *   **Usage Spike:** Proactive check against credit limit is vital.
    *   **Payment Failure for Overage + Renewal:** This is a critical state. Service suspension is common. The debt (negative ECCA balance) persists.

**5. ECCA Balance Behavior:**
    *   Starts period positive (after monthly grant).
    *   Decreases with usage.
    *   Can go negative if usage exceeds granted credits (overage), up to the Credit Limit.
    *   At period end, negative balance (overage) is invoiced.
    *   If payment for overage+renewal succeeds, balance is adjusted by both the new grant and the settlement of overage.
    *   If payment fails, balance remains negative, and no new periodic grant is applied. 