# Missing Test Cases for `usageLedgerHelpers.ts`

## `postPaymentFailedLedgerTransaction`

- **Creates no ledger items but does expire pending usage ledger items for the payment**
  - Given a payment with status `failed`, and a pending ledger item exists for that payment, after calling this function, the pending ledger item should be expired and no new ledger items should be created.
- **Returns null transaction if transaction already exists for payment+status**
  - If a transaction already exists for the same payment and status, the function should return `{ ledgerEntries: [], ledgerTransaction: null }`.
- **Throws if payment has no subscriptionId**
  - If the payment record is missing a `subscriptionId`, the function should throw an error.

---

## `createLedgerTransactionForPayment`

- **Creates a new usage transaction for a new payment+status**
  - When called with a payment and status that has not been seen before, it should create and return a new usage transaction.
- **Does not create duplicate transactions for the same payment+status**
  - When called twice with the same payment and status, it should only create one transaction and return the same transaction both times.
- **Creates different transactions for the same payment with different statuses**
  - When called with the same payment but different statuses (e.g., `processing` then `succeeded`), it should create a new transaction for each unique status.
- **Throws if payment has no subscriptionId**
  - If the payment record is missing a `subscriptionId`, the function should throw an error.

---

## `postPaymentConfirmationLedgerTransaction`

- **Creates a posted usage ledger item and expires pending ledger items**
  - When called with a payment with status `succeeded`, it should create a posted usage ledger item and expire any pending ledger items for that payment.
- **Returns null transaction if transaction already exists for payment+status**
  - If a transaction already exists for the same payment and status, the function should return `{ ledgerEntries: [], ledgerTransaction: null }`.
- **Throws if payment has no subscriptionId**
  - If the payment record is missing a `subscriptionId`, the function should throw an error.
- **Ledger item has correct entryType for payment status**
  - The created ledger item should have the correct `entryType` based on the payment status (`PaymentSucceeded`, `PaymentFailed`, etc).
