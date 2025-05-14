# Destination Accounts: Data Model Evolution for Multi-Flow of Funds

**Product Goal:** Allow a single Flowglad organization to support multiple flows of funds, starting with (v1) self-custodied Stripe accounts ("Bring Your Own API Key" - BYOK) and (v2) being ready to support direct bank accounts and other payment destinations.

**Engineering Goal:** Evolve the data model to accommodate various destination account types, manage associated external entity IDs, and handle API interactions and webhooks securely and dynamically.

## I. Core Concept: Destination Account Entity

The central piece of this evolution is the `DestinationAccount` entity. This will allow organizations to define different "places" where money can move or where financial operations are performed.

## II. New Database Tables

### 1. `destination_accounts`

This table defines each payment destination an organization uses.

| Column                 | Type         | Constraints/Notes                                                                                                |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`                   | Text         | Primary Key (e.g., `da_...`)                                                                                     |
| `organizationId`       | Text         | Foreign Key to `organizations.id` (PascalCase: `OrganizationId`), Not Null                                         |
| `name`                 | Text         | User-friendly name for the DA (e.g., "Primary Stripe (Connect)", "Stripe (Finance Dept BYOK)")                    |
| `type`                 | Enum         | (e.g., `STRIPE_CONNECT_PLATFORM`, `STRIPE_SELF_CUSTODIED`, `BANK_WIRE`, `PAYPAL`), Not Null                         |
| `status`               | Enum         | (e.g., `ACTIVE`, `INACTIVE`, `REQUIRES_ATTENTION`, `SETUP_INCOMPLETE`), Not Null                                   |
| `isDefault`            | Boolean      | Is this the default DA for new operations within the organization? Not Null, Default: `false`                    |
| `credentials`          | JSONB        | **Encrypted**. For Stripe BYOK: API keys. For Bank: Account/Routing. Nullable (e.g. platform connect may not need explicit creds here) |
| `configuration`        | JSONB        | Type-specific settings. `STRIPE_SELF_CUSTODIED`: Stripe Account ID `acct_...`, webhook signing secret. `STRIPE_CONNECT_PLATFORM`: may store platform's internal reference if needed. Nullable. |
| `livemode`             | Boolean      | Distinguishes test/live credentials/configurations for this DA. Not Null.                                          |
| `createdAt`            | TimestampTz  | Not Null, Default: `now()`                                                                                       |
| `updatedAt`            | TimestampTz  | Not Null, Default: `now()`                                                                                       |
| `archivedAt`           | TimestampTz  | Nullable, for soft deletes.                                                                                      |

### 2. `destination_account_customers`

Links Flowglad customers to their representations in specific destination accounts.

| Column                   | Type   | Constraints/Notes                                                                 |
| ------------------------ | ------ | --------------------------------------------------------------------------------- |
| `id`                     | Text   | Primary Key (e.g., `dacust_...`)                                                  |
| `flowgladCustomerId`     | Text   | Foreign Key to `customers.id` (PascalCase: `FlowgladCustomerId`), Not Null          |
| `destinationAccountId`   | Text   | Foreign Key to `destination_accounts.id` (PascalCase: `DestinationAccountId`), Not Null |
| `externalId`             | Text   | External customer ID (e.g., `cus_...` for Stripe). Nullable (not all DAs have customer IDs) |
| `data`                   | JSONB  | Additional DA-specific customer metadata. Nullable.                               |
| `createdAt`              | TimestampTz | Not Null, Default: `now()`                                                                                       |
| `updatedAt`              | TimestampTz | Not Null, Default: `now()`                                                                                       |
| **Unique Constraint:** (`flowgladCustomerId`, `destinationAccountId`)                                                |
| **Unique Constraint (conditional):** (`destinationAccountId`, `externalId`) where `externalId` is NOT NULL      |

### 3. `destination_account_payment_methods`

Links Flowglad payment methods to their representations in specific destination accounts.

| Column                          | Type   | Constraints/Notes                                                                     |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `id`                            | Text   | Primary Key (e.g., `dapm_...`)                                                        |
| `flowgladPaymentMethodId`       | Text   | Foreign Key to `paymentMethods.id` (PascalCase: `FlowgladPaymentMethodId`), Not Null    |
| `destinationAccountId`          | Text   | Foreign Key to `destination_accounts.id` (PascalCase: `DestinationAccountId`), Not Null |
| `externalId`                    | Text   | External payment method ID (e.g., `pm_...` for Stripe). Nullable.                     |
| `data`                          | JSONB  | Additional DA-specific PM metadata (e.g., last4, brand for Stripe, bank mandate details). Nullable. |
| `createdAt`                     | TimestampTz | Not Null, Default: `now()`                                                                                       |
| `updatedAt`                     | TimestampTz | Not Null, Default: `now()`                                                                                       |
| **Unique Constraint:** (`flowgladPaymentMethodId`, `destinationAccountId`)                                                       |
| **Unique Constraint (conditional):** (`destinationAccountId`, `externalId`) where `externalId` is NOT NULL                     |

### 4. `destination_account_transactions`

A generic table to store references to various transaction-like objects from PSPs and other DAs.

| Column                   | Type   | Constraints/Notes                                                                                               |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------------------- |
| `id`                     | Text   | Primary Key (e.g., `datxn_...`)                                                                                 |
| `flowgladEntityId`       | Text   | ID of the related Flowglad entity (e.g., `pym_...`, `inv_...`, `chckt_session_...`, `ref_...`), Not Null         |
| `flowgladEntityType`     | Enum   | (`PAYMENT`, `INVOICE`, `CHECKOUT_SESSION`, `REFUND`, `PAYOUT`, etc.), Not Null                                    |
| `destinationAccountId`   | Text   | Foreign Key to `destination_accounts.id` (PascalCase: `DestinationAccountId`), Not Null                           |
| `externalId`             | Text   | External ID from the DA (e.g., `pi_...`, `seti_...`, `ch_...`, `re_...` for Stripe, bank tx ref), Not Null       |
| `externalType`           | Text   | Type of the external ID (e.g., `STRIPE_PAYMENT_INTENT`, `STRIPE_CHARGE`, `BANK_TRANSFER_ID`), Not Null         |
| `status`                 | Text   | Status of the transaction at the DA (e.g. `succeeded`, `pending`, `failed`). Mirrored for quick lookup. Nullable. |
| `data`                   | JSONB  | Additional DA-specific transaction metadata. Nullable.                                                          |
| `createdAt`              | TimestampTz | Not Null, Default: `now()`                                                                                       |
| `updatedAt`              | TimestampTz | Not Null, Default: `now()`                                                                                       |
| **Index:** (`flowgladEntityId`, `flowgladEntityType`)                                                                           |
| **Index:** (`destinationAccountId`, `externalId`, `externalType`)                                                               |

### 5. `destination_account_webhooks` (Optional - could be part of `destination_accounts.configuration`)

Manages incoming webhooks from self-custodied accounts if configuration becomes too complex in the main table.

| Column                   | Type   | Constraints/Notes                                                                                                |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`                     | Text   | Primary Key (e.g., `dawh_...`)                                                                                   |
| `destinationAccountId`   | Text   | Foreign Key to `destination_accounts.id` (PascalCase: `DestinationAccountId`), Unique, Not Null                    |
| `endpointUrlSuffix`      | Text   | Unique suffix for the webhook URL Flowglad provides (e.g., `/api/webhook-stripe/da/[endpointUrlSuffix]`). Not Null. |
| `signingSecret`          | Text   | **Encrypted**. Signing secret for verifying webhook authenticity. Not Null.                                       |
| `status`                 | Enum   | (`ACTIVE`, `DISABLED`), Not Null                                                                                 |
| `createdAt`              | TimestampTz | Not Null, Default: `now()`                                                                                       |
| `updatedAt`              | TimestampTz | Not Null, Default: `now()`                                                                                       |


## III. Modifications to Existing Tables

The following existing columns will be **removed** from their current tables. Their data and relationships will be managed via the new `destination_account_...` link tables.

*   **`customers`**:
    *   Remove `stripeCustomerId`
*   **`paymentMethods`**:
    *   Remove `stripePaymentMethodId`
*   **`payments`**:
    *   Remove `stripePaymentIntentId`
    *   Remove `stripeChargeId`
    *   (Consider if `stripeTaxCalculationId`, `stripeTaxTransactionId` also need this treatment if they are DA-specific)
*   **`checkoutSessions`**:
    *   Remove `stripeSetupIntentId`
    *   Remove `stripePaymentIntentId`
*   **`invoices`**:
    *   Remove `stripePaymentIntentId`
    *   (Consider if `stripeTaxCalculationId`, `stripeTaxTransactionId` also need this treatment if they are DA-specific)

## IV. Key Logic Changes

*   **Stripe SDK Initialization (`stripe.ts`)**:
    *   The global `stripe()` instance needs to be refactored.
    *   Implement a mechanism to get a Stripe SDK instance dynamically configured for a specific `DestinationAccount` (using its stored credentials and configuration).
    *   For `STRIPE_CONNECT_PLATFORM` DAs, use platform keys + `Stripe-Account` header.
    *   For `STRIPE_SELF_CUSTODIED` DAs, use the DA's API key directly.
*   **Service Layer**: All functions performing operations involving Stripe (or future DAs) must accept a `destinationAccountId` or a resolved `DestinationAccount` object to use the correct context.
*   **Webhook Handling (`route.ts`)**:
    *   The existing `/api/webhook-stripe/[mode]/route.ts` will continue to handle platform and Connect webhooks.
    *   A new endpoint (or a modified existing one with dynamic DA lookup) will be needed for self-custodied Stripe accounts (e.g., `/api/webhook-stripe/da/[destinationAccountId_or_suffix]`).
    *   This new handler will:
        1.  Identify the `DestinationAccount` from the URL.
        2.  Retrieve the corresponding `signingSecret` from `destination_account_webhooks` or `destination_accounts.configuration`.
        3.  Verify and process the event, linking it to the correct `Organization` and `DestinationAccount`.

## V. Migration Strategy (High-Level)

1.  **Schema Changes**:
    *   Add the new tables (`destination_accounts`, `destination_account_customers`, etc.).
    *   Initially, make the *old* `stripe...Id` columns on existing tables *nullable*. Do not remove them yet.
2.  **Default DA Creation & Data Backfill**:
    *   For each existing `Organization`:
        *   Create a default `STRIPE_CONNECT_PLATFORM` type `DestinationAccount`. If the org was using Stripe Connect, populate its `configuration` with their existing Stripe Account ID (`acct_...`). If they were using the platform's old direct Stripe keys (if applicable), this DA might represent that.
    *   Write a script to:
        *   Iterate through `customers` and for each `stripeCustomerId`, create a corresponding `destination_account_customers` record linked to the customer and their organization's default DA.
        *   Repeat for `paymentMethods.stripePaymentMethodId` -> `destination_account_payment_methods`.
        *   Repeat for `payments.stripePaymentIntentId`/`stripeChargeId` -> `destination_account_transactions`.
        *   Repeat for `checkoutSessions...` and `invoices...` -> `destination_account_transactions`.
3.  **Logic Adaptation**:
    *   Modify service functions to first look for IDs in the new link tables for the relevant DA.
    *   If not found (or for a transition period), they can fall back to reading from the old `stripe...Id` columns.
    *   New entities created should *only* write to the new link tables.
4.  **Verification**: Thoroughly test that data is being read and written correctly using the new model.
5.  **Column Removal**: Once confident, schedule a maintenance window to:
    *   Run a final data consistency check.
    *   Remove the old `stripe...Id` columns from `customers`, `payments`, etc.
    *   Make the foreign keys in the link tables (e.g. `destination_account_customers.externalId`) non-nullable where appropriate for Stripe type DAs.

## VI. TODOs / Open Questions

### Technical Implementation & Design
*   **[TODO] Incremental Rollout Strategy**: Define a detailed, phased approach for introducing these changes to minimize risk, starting with schema introduction, then data migration, then logic changes. How can we run both systems (old column lookups and new DA-based lookups) in parallel for a period?
*   **[TODO] Security of `destination_accounts.credentials`**: Define the encryption mechanism (e.g., HashiCorp Vault, application-level encryption using KMS). How are keys managed? Who/what has decryption access?
*   **[TODO] API Key Management for BYOK**: How will API key rotation/updates be handled for self-custodied Stripe DAs?
*   **[TODO] Linking Existing External Entities**: If an organization connects an existing Stripe account, what's the process for mapping their existing Stripe Customers/PaymentMethods to Flowglad entities, especially if those Flowglad entities also exist from prior interactions (e.g., via the platform DA)?
*   **[TODO] Transactionality & Sagas**: How will operations that span Flowglad DB updates and calls to external DAs be managed to ensure data consistency? (e.g., sagas, compensating transactions).
*   **[TODO] Impact Analysis on `stripe.ts`**: Detailed plan for refactoring `stripe.ts` for dynamic SDK instantiation per DA.
*   **[TODO] Detailed Webhook Architecture**: Finalize the URL structure and processing logic for DA-specific webhooks.
*   **[TODO] Database Indexing**: Review and optimize indexes on new tables based on expected query patterns.
*   **[TODO] Livemode Handling**: Ensure `livemode` is consistently applied and respected across all DA operations and data storage.

### Product & UX
*   **[TODO] UI/UX for DA Management**: Design the interface for organizations to add, configure (including credential input), and manage their DAs.
*   **[TODO] DA Selection in Workflows**: How will users select a DA for specific operations if not using the organization's default DA?
*   **[TODO] Error Handling & Reconciliation UX**: How will errors from different DAs be surfaced to users? What tools or views will be provided for reconciliation?

### Business & Operations
*   **[TODO] Platform Fee Management**:
    *   How does Flowglad identify and calculate its platform fee when transactions occur on a self-custodied Stripe account (or other DA types)?
    *   Where and how will Flowglad track the fees owed to it by organizations using their own DAs?
    *   How will Flowglad collect these fees (e.g., separate invoicing, debiting from a platform-controlled account)?
*   **[TODO] Data Migration Plan**: Detailed steps, scripts, and validation for migrating existing Stripe IDs.
*   **[TODO] Permissions Model**: Define which user roles within an organization can view, create, edit, or delete Destination Accounts and their configurations.

### Future Considerations
*   **[TODO] Extensibility for `BANK_WIRE` and other DAs**: While designing for Stripe, keep the model generic enough. What specific fields in `destination_accounts.configuration` or `destination_account_transactions.data` would a `BANK_WIRE` DA need?
*   **[TODO] Payouts/Transfers**: How will this model support initiating payouts or transfers *from* these DAs if that becomes a requirement? (The `destination_account_transactions.flowgladEntityType` could include `PAYOUT`).

This document should serve as a starting point for breaking down the "Destination Accounts" epic into smaller, manageable user stories and engineering tasks.
