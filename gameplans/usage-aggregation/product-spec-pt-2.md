# Game Plan Part 2: Advanced Pricing Models & Billing Clarity

This document is a continuation of the original `product-spec.md`. It outlines the plan to evolve our pricing and billing models to support more sophisticated, real-world use cases like usage-based trials and tiered overage pricing. It builds upon the core philosophy that our billing system must be a deterministic function of immutable, ground-truth events recorded in a double-entry ledger.

## 1. Advanced Pricing & Subscription Models

Our initial model treated prices as simple, self-contained records. To support more complex commercial offerings, we must enhance our price and subscription schemas to explicitly define the relationships between different pricing components and to manage the subscription lifecycle from trial to active billing.

### 1.1. Modeling Usage-Based Trials

The goal is to support trials that are not time-based, but rather based on the consumption of a one-time grant of usage credits. The trial ends and transitions to a paid state when these credits are exhausted and the customer adds a payment method.

**The Chosen Design: A `credit_trial` Subscription State with an Explicit Price Flag**

We will introduce a new `startsWithCreditTrial` boolean flag to the `prices` table and a new `credit_trial` status to the `SubscriptionStatus` enum.

**How it Works:**
1.  **Price Signal:** A merchant configures a `Price` with `startsWithCreditTrial = true`. This `Price` is associated with a `Product` that has one-time `usage_credit_grant` features.
2.  **Subscription Creation:** When a customer subscribes to this `Price`:
    *   A `Subscription` record is created with `status: 'credit_trial'`.
    *   Critically, `currentBillingPeriodStart` and `currentBillingPeriodEnd` are `NULL`. This is a key signal: a "billing period" has no meaning for a subscription that is not yet being billed.
    *   The system atomically finds all one-time `usage_credit_grant` features on the `Product` and posts the corresponding credits to the new subscription's ledger account(s).
3.  **Activation:** The subscription remains in the `credit_trial` state indefinitely until the customer "activates" it. This is a distinct user action (e.g., "Add Payment Method & Upgrade") which triggers an `activate_subscription` checkout flow. This flow attaches a payment method, transitions the `status` to `'active'`, and sets the initial `billingCycleAnchorDate`, `currentBillingPeriodStart`, and `currentBillingPeriodEnd`, officially starting the billing cycle.

**Why This Design is Superior:**
*   **Maintains a Single Customer Narrative:** It avoids the "Two-Product" model, where a customer subscribes to a "Free Trial Product" and then has to be migrated to a "Paid Product." Our chosen approach correctly models the trial not as a different product, but as a different *state* of the same subscription. This preserves a clean, continuous history for the customer's relationship with the product and its associated ledger accounts.
*   **Clarity and Unambiguity:** The `startsWithCreditTrial` flag is an explicit, unambiguous signal of intent. There is no magic or inference required. It's clear from the `Price` record itself how it behaves. The `NULL` billing period dates for `credit_trial` subscriptions provide an equally unambiguous signal in the data model about the subscription's state.
*   **Simplicity of Upgrade:** The transition from trial to paid is a simple state change (`status: 'credit_trial' -> 'active'`) and the addition of billing-cycle data. It does not require a complex data migration between different subscription or product records.

### 1.2. Modeling Overages and Tiered Pricing

The goal is to represent a complete "Plan" or "Package" within a single, unambiguous `Price` record. This includes the base recurring fee, included allowances, and specific overage rates.

The chosen design introduces a self-referencing foreign key on the `prices` table: `overagePriceId`.

*   **A `Price` of `type: 'Subscription'`** defines the recurring, flat-rate component. Its `overagePriceId` can point to another `Price` record.
*   **A `Price` of `type: 'Usage'`** defines a per-unit cost. It is linked via `overagePriceId` and contains the `usageMeterId` it applies to.

This creates an explicit, machine-readable link that eliminates ambiguity. It's superior to relying on conventions or multiple, disconnected prices on a product because the relationship is part of the data model itself.

### 1.3. Practical Examples of New Pricing Models

Here are a few examples of commercial offerings we can now model that were previously difficult or impossible.

**Example A: "Freemium" with a Usage-Based Trial**

*   **Offer:** "Try our service with 10,000 free API calls. After that, add a payment method to continue."
*   **Implementation:**
    1.  Create a `Product` (e.g., "API Access").
    2.  Associate it with a `Feature` that grants a one-time `10,000` credit to the `api_calls` usage meter.
    3.  Create a `Price` with `type: 'Subscription'`, `unitAmount: 0`, and `startsWithCreditTrial: true`. This price is what the user "subscribes" to initially.

**Example B: "Pro Plan" with Simple Overage**

*   **Offer:** "$50/month for 5,000 messages, with additional messages costing $0.01 each."
*   **Implementation:**
    1.  Create a `Product` ("Pro Plan") associated with a `Feature` granting `5,000` recurring credits to the `messages` meter.
    2.  Create a `Price` for the overage:
        *   `id: 'price_overage_pro_msg'`
        *   `type: 'Usage'`
        *   `unitAmount: 1` (i.e., $0.01)
        *   `usageMeterId: 'meter_messages'`
    3.  Create the main subscription `Price`:
        *   `id: 'price_pro_monthly'`
        *   `type: 'Subscription'`
        *   `unitAmount: 5000` (i.e., $50.00)
        *   `recurring: { interval: 'month', intervalCount: 1 }`
        *   `overagePriceId: 'price_overage_pro_msg'`

**Example C: Tiered Plan with an Initial Free Quota**

*   **Offer:** "First 100 messages free, then $10/mo for 500 messages, with additional messages costing $0.01 each."
*   **Analysis:** This represents a usage-based trial that converts into a paid subscription with a recurring allowance and overage. This is an excellent demonstration of how the `startsWithCreditTrial` flag can be combined with a comprehensive price definition to model sophisticated, real-world customer acquisition flows.
*   **Implementation:**
    1.  **Create a `Product`** (e.g., "Graduated Messaging Plan").
    2.  **Associate `Features` with the `Product`:**
        *   A `Feature` granting a **one-time** `100` credit to the `messages` usage meter. This covers the free introductory quota.
        *   A `Feature` granting a **recurring** `500` credit to the `messages` usage meter. This is the monthly allowance for the paid plan.
    3.  **Create the overage `Price`:**
        *   `id: 'price_overage_graduated_msg'`
        *   `type: 'Usage'`
        *   `unitAmount: 1` (i.e., $0.01)
        *   `usageMeterId: 'meter_messages'`
    4.  **Create the main subscription `Price`:**
        *   `id: 'price_graduated_monthly'`
        *   `type: 'Subscription'`
        *   `unitAmount: 1000` (i.e., $10.00)
        *   `recurring: { interval: 'month', intervalCount: 1 }`
        *   `overagePriceId: 'price_overage_graduated_msg'`
        *   `startsWithCreditTrial: true` **<-- This is the key.**
*   **How it Works in Practice:**
    1.  **Subscription:** A new customer subscribes to `price_graduated_monthly`.
    2.  **Trial State:** The subscription is created with `status: 'credit_trial'`. The system immediately applies the one-time `Feature` and grants `100` credits to their `messages` ledger account. No billing cycle dates are set.
    3.  **Usage:** The customer can send up to 100 messages for free.
    4.  **Activation:** Once the credits are exhausted (or at any time), the customer provides a payment method to activate the subscription.
        *   The `status` changes to `'active'`.
        *   The `billingCycleAnchorDate` is set, initiating the first billing period.
        *   The recurring `Feature` is applied for the first time, granting `500` credits.
        *   The customer is billed $10.00 for their first month. From this point on, they have a 500-message monthly allowance and will be charged $0.01 for any message beyond that, as defined by the overage price.

## 2. Enhanced Billing Run & Invoice Generation

The core principle of our billing system remains: **generate an invoice by tabulating the outstanding balance on a customer's ledger accounts.** However, to provide customers with clear, transparent, and auditable invoices, we must enhance our tabulation logic.

The problem arises when a single usage meter has usage events recorded against different prices within one billing period (e.g., due to a mid-cycle plan change or promotional credits). A simple total of outstanding usage doesn't tell the customer *why* they are being charged a certain amount.

### The Solution: Group by `(usageMeterId, priceId)`

The chosen solution is to refine the billing run's tabulation process. Instead of just calculating the total outstanding balance for a usage meter, the system will group the underlying ledger entries that constitute that balance by their associated `priceId`.

This results in one invoice line item per unique `(usageMeterId, priceId)` pair for which there is a billable (debit) balance.

This approach was chosen because it maintains a clean, continuous history for a single subscription, avoiding the complexity of migrating ledger accounts and historical data between what are conceptually two phases of the same customer relationship.

### 2.1. Practical Example of Billing Tabulation

Let's walk through a scenario for a customer on the "Pro Plan" from above.

*   **Subscription:** The customer is subscribed to `price_pro_monthly`. At the start of the month, their `messages` ledger account is granted `5,000` credits.
*   **Ledger State (Start):** `messages` account balance = `5,000` (credit).

**Usage Events during the month:**

1.  **Week 1:** A `usageEvent` is posted for `4,000` messages.
    *   **Price:** The system resolves this against the subscription's included credits. No `priceId` is needed as it's not overage.
    *   **Ledger Impact:** `4,000` is debited from the `messages` account.
    *   **Ledger State:** Balance is now `1,000` (credit).
2.  **Week 2:** A `usageEvent` is posted for `2,000` messages.
    *   **Price:** This usage will exceed the allowance. The API call must specify the overage price: `priceId: 'price_overage_pro_msg'`.
    *   **Ledger Impact:** `2,000` is debited from the `messages` account.
    *   **Ledger State:** Balance is now `-1,000` (debit). This represents `1,000` messages of billable overage. The ledger entries for this debit are tagged with `price_overage_pro_msg`.

**End of Billing Period - Invoice Generation:**

The billing run inspects the customer's ledger.

1.  It sees the subscription fee for `price_pro_monthly`: **$50.00**.
2.  It inspects the `messages` meter account and finds an outstanding debit balance of `1,000`.
3.  It groups the entries making up this debit balance. It finds they are all associated with `price_overage_pro_msg` (`unitAmount: 1`).
4.  It creates an invoice line item:
    *   **Description:** "Overage for Messages"
    *   **Quantity:** 1,000
    *   **Unit Price:** $0.01
    *   **Total:** **$10.00**

The final invoice clearly shows the base fee and the exact quantity and rate for the overage, because the tabulation logic preserved the pricing context from the original usage events.

## 3. Speculative Futurespeak: Modeling Pay-As-You-Go (PAYGO)

**_Note: The following is a speculative design proposal. It represents our current thinking but requires further refinement, validation, and debate before implementation._**

While the models above cover subscriptions with trials and overages, a pure Pay-As-You-Go model (where a customer pre-purchases a block of credits with no recurring fee) presents a unique challenge.

### 3.1. The Core Problem: The "Wallet"

The primary challenge is figuring out where to grant purchased credits, especially for a new customer. Our model correctly assumes all usage ledgers are attached to a `Subscription`. This raises two questions:

1.  For a new customer buying their first credit pack, how do we create the `Subscription` "wallet" to hold these credits without resorting to confusing, implicit logic?
2.  For an existing customer who may have multiple subscriptions, how do we ensure a "top-up" credit pack is applied to the correct subscription?

The goal is to solve this by encoding policy directly in the data model, rather than relying on brittle application logic that tries to guess the customer's intent.

### 3.2. Proposed Solution: Price-Driven Intent

The proposed solution is to add a new column to the `prices` table to define the explicit behavior of `one_time` prices.

-   **New Column:** `oneTimeBehavior` on the `prices` table.
-   **Applies to:** This field is only meaningful when `prices.type = 'one_time'`. For `subscription` or `usage` prices, it would be `NULL`.
-   **Values (Enum):**
    -   `'starter_pack'`: This intent signals that purchasing this price is meant to **initiate a new PAYGO wallet**. The system's logic upon purchase is to create a new `Subscription` record with a `null` `priceId` (signifying no recurring fee) and grant it the associated credits from the product's features. This elegantly solves the "new customer" problem.
    -   `'top_up'`: This intent signals that the credits are meant to be **added to an existing subscription**. An API call to purchase a `top_up` price would be required to include a `targetSubscriptionId`, forcing the user to make an explicit choice about where the credits should go.
    -   `'standard'`: The default value, representing a simple one-off charge with no special credit or subscription logic (e.g., a one-time setup fee).

### 3.3. How This Defines Policy

This design makes the system's behavior deterministic and auditable. The outcome of a purchase is not inferred from the customer's state; it is dictated by an explicit property of the `Price` they are purchasing.

-   A PAYGO offering would be composed of two prices: one with `oneTimeBehavior: 'starter_pack'` for the initial purchase, and another with `oneTimeBehavior: 'top_up'` for all subsequent credit additions.
-   A customer relationship can flexibly evolve. A user can start with a PAYGO wallet (`priceId: null`) and later "upgrade" by attaching a recurring `priceId` to the *same* subscription record, preserving their history.

### 3.4. Design Considerations & Trade-offs

This approach introduces a "co-interaction" problem: the `oneTimeBehavior` column is conditionally meaningful. This is a pragmatic trade-off for the simplicity of keeping all price configuration on a single table. It is consistent with our existing use of the `recurring` and `overagePriceId` fields, which are only meaningful for subscription prices.

This conditional relationship would be strictly enforced at the application level using discriminated unions in our Zod schemas, ensuring type safety and preventing logic errors.
