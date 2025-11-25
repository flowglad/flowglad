# Payment Intent Success Event Refactoring Gameplan

## Executive Summary

This document outlines a refactoring plan to consolidate how we handle Stripe payment intent success events when processing billing run payments synchronously. Currently, two ledger commands (`SettleInvoiceUsageCostsLedgerCommand` and `BillingPeriodTransitionLedgerCommand`) are created in separate `comprehensiveAdminTransaction` calls. 

**Key Goal**: Consolidate all ledger command creation and execution within `processPaymentIntentEventForBillingRun` by modifying `comprehensiveAdminTransaction` to accept multiple ledger commands, ensuring atomicity and idempotency for the entire operation.

## Current State Analysis

### Current Implementation Issues

1. **Split Logic**: 
   - `SettleInvoiceUsageCostsLedgerCommand` is created in `processPaymentIntentEventForBillingRun` (line 453-467 in `processBillingRunPaymentIntents.ts`)
   - `BillingPeriodTransitionLedgerCommand` is created in `processTerminalPaymentIntent` (line 1034-1118 in `billingRunHelpers.ts`)

2. **Transaction Separation**:
   - Two separate `comprehensiveAdminTransaction` calls in `stripePaymentIntentSucceededTask` (lines 35-42 and 44-54)
   - No unified workflow for handling both commands

3. **Constraint**:
   - `comprehensiveAdminTransaction` currently only processes ONE ledger command per transaction (see `adminTransaction.ts` lines 100-103)
   - This constraint will be removed by allowing multiple ledger commands

## Proposed Solution

### Core Changes

1. **Modify `comprehensiveAdminTransaction` to accept multiple ledger commands**:
   - Change `TransactionOutput` to support `ledgerCommands?: LedgerCommand[]` (array instead of single command)
   - Process all commands sequentially within the same transaction
   - Maintain atomicity - all commands succeed or all fail

2. **Move `processTerminalPaymentIntent` logic into `processPaymentIntentEventForBillingRun`**:
   - Integrate billing period transition command creation directly into the billing run processing
   - Remove the need for separate transaction calls
   - All billing run payment intent logic in one place

3. **Remove `comprehensiveAdminTransaction` from `executeBillingRun`**:
   - Replace the terminal payment intent processing in `executeBillingRun` with a call to `processPaymentIntentEventForBillingRun`
   - Consolidate all payment intent success handling in one function

4. **Ensure idempotency for all operations**:
   - Verify `SettleInvoiceUsageCostsLedgerCommand` is idempotent (uses unique constraint on invoice ID)
   - Verify `BillingPeriodTransitionLedgerCommand` is idempotent
   - Handle race conditions between synchronous responses and webhook responses

## Implementation Plan (Organized by Pull Requests)

### Pull Request 1: Add Multiple Ledger Command Support to `comprehensiveAdminTransaction`

**Goal**: Allow `comprehensiveAdminTransaction` to optionally accept multiple ledger commands while maintaining backward compatibility.

**Files to Modify**:
- `platform/flowglad-next/src/db/transactionEnhacementTypes.ts`
- `platform/flowglad-next/src/db/adminTransaction.ts`
- `platform/flowglad-next/src/db/authenticatedTransaction.ts` (if needed)

**Changes**:

1. **Update `TransactionOutput` type**:
   ```typescript
   // File: platform/flowglad-next/src/db/transactionEnhacementTypes.ts
   export interface TransactionOutput<T> {
     result: T
     eventsToInsert?: Event.Insert[]
     ledgerCommand?: LedgerCommand  // Keep for backward compatibility
     ledgerCommands?: LedgerCommand[]  // NEW: Support multiple commands
   }
   ```

2. **Update `comprehensiveAdminTransaction` to process multiple commands**:
   ```typescript
   // Combine both ledgerCommand and ledgerCommands into a single array
   // This handles all cases: only ledgerCommand, only ledgerCommands, both, or neither
   const allLedgerCommands = [
     ...(output.ledgerCommand ? [output.ledgerCommand] : []),
     ...(output.ledgerCommands || [])
   ]
   
   // Process all commands
   for (const command of allLedgerCommands) {
     await processLedgerCommand(command, transaction)
   }
   ```

3. **Benefits of Combining Approach**:
   - No validation needed - both can be provided and will be combined
   - Backward compatible - existing code using `ledgerCommand` continues to work
   - Flexible - allows mixing single and multiple commands if needed
   - Simpler - no error handling for invalid combinations

4. **Testing**: Ensure all existing code using `ledgerCommand` continues to work

### Pull Request 2: Add Idempotency Checks to Ledger Manager

**Goal**: Add general idempotency check mechanism in `processLedgerCommand` to prevent duplicate ledger transaction creation for all ledger commands using an application-level check pattern.

**Files to Modify**:
- `platform/flowglad-next/src/db/ledgerManager/ledgerManager.ts`
- `platform/flowglad-next/src/db/ledgerManager/billingPeriodTransitionLedgerCommand/index.ts` (remove duplicate idempotency check)

**Changes**:

1. **Add General Idempotency Check in `processLedgerCommand`**:
   ```typescript
   // In ledgerManager.ts, add helper function to extract idempotency key:
   const extractIdempotencyKey = (
     command: LedgerCommand
   ): { initiatingSourceType: string, initiatingSourceId: string } | null => {
     // Extract idempotency key based on command type
     switch (command.type) {
       case LedgerTransactionType.SettleInvoiceUsageCosts:
         return {
           initiatingSourceType: LedgerTransactionInitiatingSourceType.InvoiceSettlement,
           initiatingSourceId: command.payload.invoice.id,
         }
       case LedgerTransactionType.BillingPeriodTransition:
         return {
           initiatingSourceType: command.type, // Uses command.type as initiatingSourceType
           initiatingSourceId: command.payload.type === 'standard'
             ? command.payload.newBillingPeriod.id
             : command.payload.subscription.id,
         }
       case LedgerTransactionType.CreditGrantRecognized:
         return {
           initiatingSourceType: command.type,
           initiatingSourceId: command.payload.usageCredit.id,
         }
       case LedgerTransactionType.UsageEventProcessed:
         return {
           initiatingSourceType: LedgerTransactionInitiatingSourceType.UsageEvent,
           initiatingSourceId: command.payload.usageEvent.id,
         }
       case LedgerTransactionType.AdminCreditAdjusted:
         return {
           initiatingSourceType: command.type,
           initiatingSourceId: command.payload.usageCreditBalanceAdjustment.id,
         }
       case LedgerTransactionType.CreditGrantExpired:
         return {
           initiatingSourceType: command.type,
           initiatingSourceId: command.payload.expiredUsageCredit.id,
         }
       case LedgerTransactionType.PaymentRefunded:
         return {
           initiatingSourceType: LedgerTransactionInitiatingSourceType.Refund,
           initiatingSourceId: command.payload.refund.id,
         }
       default:
         return null // Command type doesn't support idempotency check
     }
   }
   
   // Update processLedgerCommand to check idempotency before processing:
   export const processLedgerCommand = async (
     rawCommand: LedgerCommand,
     transaction: DbTransaction
   ): Promise<LedgerCommandResult> => {
     const command = ledgerCommandSchema.parse(rawCommand)
     
     // Check idempotency before processing
     const idempotencyKey = extractIdempotencyKey(command)
     if (idempotencyKey) {
       const [existingTransaction] = await selectLedgerTransactions(
         {
           type: command.type,
           initiatingSourceType: idempotencyKey.initiatingSourceType,
           initiatingSourceId: idempotencyKey.initiatingSourceId,
           organizationId: command.organizationId,
           livemode: command.livemode,
         },
         transaction
       )
       
       if (existingTransaction) {
         // Return existing transaction and entries (idempotent retry)
         const existingEntries = await selectLedgerEntries(
           { ledgerTransactionId: existingTransaction.id },
           transaction
         )
         return {
           ledgerTransaction: existingTransaction,
           ledgerEntries: existingEntries,
         }
       }
     }
     
     // No existing transaction found, proceed with normal processing
     switch (command.type) {
       // ... existing switch cases ...
     }
   }
   ```

2. **Remove Existing Idempotency Check from `BillingPeriodTransitionLedgerCommand`**:
   - Since idempotency is now handled at the `processLedgerCommand` level, remove the duplicate check from `processBillingPeriodTransitionLedgerCommand` (lines 28-49)
   - This consolidates idempotency logic in one place

3. **Benefits of This Approach**:
   - Centralized idempotency logic - all commands benefit automatically
   - Consistent behavior across all ledger commands
   - Prevents constraint violations by checking before inserting
   - Easier to maintain - idempotency logic in one place
   - Can be extended to new command types by adding to the switch case

### Pull Request 3: Business Logic Changes - Consolidate Ledger Commands in `processPaymentIntentEventForBillingRun`

**Goal**: Move `processTerminalPaymentIntent` logic into `processPaymentIntentEventForBillingRun`, update function signature to support both webhook events and synchronous payment intents, and deprecate `processTerminalPaymentIntent`.

**Files to Modify**:
- `platform/flowglad-next/src/subscriptions/processBillingRunPaymentIntents.ts`
- `platform/flowglad-next/src/trigger/stripe/payment-intent-succeeded.ts`
- `platform/flowglad-next/src/subscriptions/billingRunHelpers.ts`

**Changes**:

1. **Update `processPaymentIntentEventForBillingRun` function signature**:
   - Support both Stripe events (for webhooks) and direct payment intent objects (for synchronous calls)
   - New signature:
     ```typescript
     type ProcessPaymentIntentForBillingRunInput = 
       | { event: PaymentIntentEvent }  // For webhook events
       | { paymentIntent: Stripe.PaymentIntent, lastEventTimestamp: Date | number }  // For synchronous calls
     
     export const processPaymentIntentEventForBillingRun = async (
       input: ProcessPaymentIntentForBillingRunInput,
       transaction: DbTransaction
     ): Promise<TransactionOutput<{...}>>
     ```
   - Extract payment intent and timestamp from either input format:
     ```typescript
     // At the start of the function:
     const paymentIntent = 'event' in input 
       ? input.event.data.object 
       : input.paymentIntent
     
     const eventTimestamp = 'event' in input
       ? dateFromStripeTimestamp(input.event.created)
       : new Date(input.lastEventTimestamp)
     
     const eventTimestampMs = eventTimestamp.getTime()
     ```
   - Maintain backward compatibility with existing webhook calls

2. **Add `processTerminalPaymentIntent` logic directly into `processPaymentIntentEventForBillingRun`**:
   - Import necessary functions from `billingRunHelpers.ts` (e.g., `selectCurrentlyActiveSubscriptionItems`, `selectSubscriptionItemFeatures`, `selectBillingPeriods`)
   - Add logic to create `BillingPeriodTransitionLedgerCommand` when payment succeeded and invoice is paid
   - This replaces the need to call `processTerminalPaymentIntent` separately

3. **Create both ledger commands in the same function**:
   ```typescript
   const ledgerCommands: LedgerCommand[] = []
   
   // Create SettleInvoiceUsageCostsLedgerCommand if invoice is paid
   if (invoice.status === InvoiceStatus.Paid) {
     ledgerCommands.push({
       type: LedgerTransactionType.SettleInvoiceUsageCosts,
       payload: { invoice, invoiceLineItems },
       livemode: invoice.livemode,
       organizationId: invoice.organizationId,
       subscriptionId: invoice.subscriptionId!,
     })
   }
   
   // Create BillingPeriodTransitionLedgerCommand if payment succeeded and invoice is paid
   if (billingRunStatus === BillingRunStatus.Succeeded && 
       invoice.status === InvoiceStatus.Paid) {
     // Logic from processTerminalPaymentIntent:
     const activeSubscriptionItems = await selectCurrentlyActiveSubscriptionItems(
       { subscriptionId: subscription.id },
       billingPeriod.startDate,
       transaction
     )
     
     const subscriptionItemFeatures = await selectSubscriptionItemFeatures(
       {
         subscriptionItemId: activeSubscriptionItems.map(item => item.id),
         type: FeatureType.UsageCreditGrant,
       },
       transaction
     )
     
     const allBillingPeriods = await selectBillingPeriods(
       { subscriptionId: subscription.id },
       transaction
     )
     
     const previousBillingPeriod = allBillingPeriods
       .filter(bp => bp.startDate < billingPeriod.startDate)
       .sort((a, b) => b.startDate - a.startDate)[0] || null
     
     ledgerCommands.push({
       type: LedgerTransactionType.BillingPeriodTransition,
       organizationId: organization.id,
       subscriptionId: subscription.id,
       livemode: billingPeriod.livemode,
       payload: {
         type: 'standard',
         subscription,
         previousBillingPeriod,
         newBillingPeriod: billingPeriod,
         subscriptionFeatureItems: subscriptionItemFeatures.filter(
           item => item.type === FeatureType.UsageCreditGrant
         ),
       },
     })
   }
   
   return {
     result: {
       invoice,
       invoiceLineItems,
       billingRun,
       payment,
     },
     eventsToInsert,
     ledgerCommands: ledgerCommands.length > 0 ? ledgerCommands : undefined,
   }
   ```

4. **Update `stripePaymentIntentSucceededTask`**:

   - Simplify transaction handling (lines 34-56)
   - Remove the second `comprehensiveAdminTransaction` call that currently calls `processTerminalPaymentIntent` (lines 44-54)
   - Update to use new function signature with event format:
     ```typescript
     if ('billingRunId' in metadata) {
       const result = await comprehensiveAdminTransaction(
         async ({ transaction }) => {
           return await processPaymentIntentEventForBillingRun(
             { event: payload },
             transaction
           )
         }
       )
       return result
     }
     ```

5. **Update `executeBillingRun` to Use New Function Signature**:

   - Remove `comprehensiveAdminTransaction` wrapper from terminal payment intent processing (lines 884-933)
   - Replace `processTerminalPaymentIntent` call with `processPaymentIntentEventForBillingRun`
   - Use new function signature with payment intent object:
     ```typescript
     // After payment intent confirmation (lines 855-860)
     const confirmationResult = await confirmPaymentIntentForBillingRun(
       paymentIntent.id,
       billingRun.livemode
     )
     
     // Update payment record with charge ID (keep existing logic)
     if (payment) {
       await adminTransaction(async ({ transaction }) => {
         await updatePayment({
           id: payment.id,
           stripeChargeId: confirmationResult.latest_charge
             ? stripeIdFromObjectOrId(confirmationResult.latest_charge)
             : null,
         }, transaction)
       }, { livemode: billingRun.livemode })
     }
     
     // Process payment intent (replaces lines 884-933)
     if (confirmationResult.status === 'succeeded' || 
         confirmationResult.status === 'requires_payment_method') {
       await comprehensiveAdminTransaction(async ({ transaction }) => {
         // Update invoice status if needed
         const [invoice] = await selectInvoices(
           { billingPeriodId: billingRun.billingPeriodId },
           transaction
         )
         
         if (invoice) {
           let targetInvoiceStatus: InvoiceStatus
           if (confirmationResult.status === 'succeeded') {
             const totalPaid = totalAmountPaid + confirmationResult.amount_received
             targetInvoiceStatus = totalPaid >= totalDueAmount
               ? InvoiceStatus.Paid
               : InvoiceStatus.Open
           } else {
             targetInvoiceStatus = InvoiceStatus.Open
           }
           
           await safelyUpdateInvoiceStatus(invoice, targetInvoiceStatus, transaction)
         }
         
         // Process payment intent using new signature (this will create both ledger commands)
         return await processPaymentIntentEventForBillingRun(
           {
             paymentIntent: confirmationResult,
             lastEventTimestamp: new Date(),
           },
           transaction
         )
       }, { livemode: billingRun.livemode })
     }
     ```

6. **Deprecate `processTerminalPaymentIntent`**:
   - Mark function as deprecated with JSDoc comment
   - Add migration note pointing to `processPaymentIntentEventForBillingRun`
   - Remove or keep based on usage audit (see FIXME below)

7. **Migrate Test Cases**:
   - Update tests in `billingRunHelpers.test.ts` to use new function signature
   - Update test assertions to verify `ledgerCommands` array
   - Ensure all existing test coverage is preserved

## Idempotency Strategy

### Current Idempotency Mechanisms

1. **Database-Level Constraints**:
   - `LedgerTransaction` has unique constraint on `(type, initiatingSourceType, initiatingSourceId, livemode, organizationId)`
   - `SettleInvoiceUsageCostsLedgerCommand`: Uses `initiatingSourceId = invoice.id`
   - `BillingPeriodTransitionLedgerCommand`: Uses `initiatingSourceId = billingPeriod.id`
   - Attempting to create duplicate transactions will fail with constraint violation

2. **Application-Level Checks** (Recommended Addition):
   - Before creating ledger commands, check if `LedgerTransaction` already exists
   - If exists, skip command creation (idempotent retry)
   - If not exists, proceed with command creation

### Race Condition Handling

**Problem**: When payment intent succeeds synchronously (from `executeBillingRun`), we may process it before the webhook arrives, or vice versa.

**Solution**:
1. **Use `lastPaymentIntentEventTimestamp` in `processPaymentIntentEventForBillingRun`**:
   - Already implemented (lines 226-263)
   - Skips processing if event timestamp is older than last processed timestamp
   - This handles out-of-order webhook events

2. **Idempotency via Unique Constraints**:
   - Both ledger commands use unique constraints that prevent duplicate execution
   - If webhook arrives after synchronous processing, it will attempt to create the same ledger transactions
   - Database constraint will prevent duplicates
   - Need to handle constraint violations gracefully (catch and ignore if transaction already exists)

3. **Recommended Pattern**:
   ```typescript
   // In processPaymentIntentEventForBillingRun, before creating commands:
   const existingSettleTransaction = await selectLedgerTransactions({
     type: LedgerTransactionType.SettleInvoiceUsageCosts,
     initiatingSourceType: LedgerTransactionInitiatingSourceType.InvoiceSettlement,
     initiatingSourceId: invoice.id,
     organizationId: invoice.organizationId,
     livemode: invoice.livemode,
   }, transaction)
   
   if (existingSettleTransaction.length === 0) {
     // Only create command if transaction doesn't exist
     ledgerCommands.push({ /* SettleInvoiceUsageCostsLedgerCommand */ })
   }
   
   // Similar check for BillingPeriodTransitionLedgerCommand
   ```

## PR Implementation Order

**PR 1** should be merged first as it provides the foundation (multiple ledger commands support).

**PR 2** can be merged independently or in parallel with PR 1, as it adds idempotency checks that work with both single and multiple commands.

**PR 3** depends on PR 1 and PR 2 being merged, as it uses both multiple command support and relies on idempotency checks.

## Testing Strategy Per PR

### PR 1 Testing
- Test backward compatibility: existing code using `ledgerCommand` still works
- Test multiple commands: verify `ledgerCommands` array processes all commands
- Test combining: verify that if both `ledgerCommand` and `ledgerCommands` are provided, they are combined and all processed
- Test atomicity: if one command fails, transaction rolls back

### PR 2 Testing
- Test idempotency: calling same command twice returns existing transaction
- Test across multiple command types: verify idempotency works for `SettleInvoiceUsageCosts`, `BillingPeriodTransition`, `CreditGrantRecognized`, etc.
- Test performance: idempotency checks don't significantly impact performance
- Test commands that don't support idempotency: verify they still process normally

### PR 3 Testing
- Test webhook flow: `stripePaymentIntentSucceededTask` works with event format
- Test synchronous flow: `executeBillingRun` works with payment intent format
- Test both commands created: verify `ledgerCommands` contains both when appropriate
- Test conditional creation: verify commands only created when conditions are met
- Test idempotency: verify both commands handle duplicate execution
- Test race conditions: synchronous + webhook scenarios
- Migrate existing tests: update `processTerminalPaymentIntent` tests to new function

## Key Decision Points

### Decision 1: Multiple Commands vs Single Command

**Decision**: Support both `ledgerCommand` (single) and `ledgerCommands` (array) for backward compatibility
- Existing code can continue using `ledgerCommand`
- New code can use `ledgerCommands` for multiple commands
- Both can be provided simultaneously - they will be combined into a single array for processing
- No validation needed - this approach is more flexible and simpler

### Decision 2: General vs Specific Idempotency Check

**Decision**: Implement general idempotency check mechanism in `processLedgerCommand` for all ledger commands
- **Approach**: Add a switch case in `processLedgerCommand` to extract `initiatingSourceType` and `initiatingSourceId` based on command type, then check for existing transaction before processing
- **Benefits**: Centralized logic, all commands benefit automatically, easier to maintain and extend
- **Migration**: Remove existing idempotency check from `BillingPeriodTransitionLedgerCommand` since it will be handled at the general level

### Decision 3: Function Signature for Synchronous vs Webhook

**Decision**: Support both formats with discriminated union type
- Webhook events: `{ event: PaymentIntentEvent }`
- Synchronous calls: `{ paymentIntent: Stripe.PaymentIntent, lastEventTimestamp: Date | number }`
- Extract common data (payment intent object, timestamp) from either format
- Maintain backward compatibility with existing webhook calls

### Decision 4: What About `processTerminalPaymentIntent`?

**Decision**: Move logic into `processPaymentIntentEventForBillingRun` and deprecate `processTerminalPaymentIntent`
- All billing run payment intent logic in one place
- Reduces code duplication
- If used elsewhere, mark as deprecated and migrate callers

### Decision 5: Command Execution Order

**Decision**: Execute commands in the order they appear in the array
- `SettleInvoiceUsageCostsLedgerCommand` should be first (settles usage costs)
- `BillingPeriodTransitionLedgerCommand` should be second (transitions to new period)
- If first command fails, second won't execute (atomicity)

## Error Handling

### Scenario 1: One Command Fails in Multi-Command Transaction
- **Impact**: Transaction rolls back, no commands execute (atomicity)
- **Mitigation**: 
  - Ensure all data is valid before creating commands
  - Add comprehensive error logging
  - Retry the entire operation if appropriate

### Scenario 2: Race Condition: Synchronous + Webhook
- **Impact**: Both try to create same ledger transactions
- **Mitigation**: 
  - Application-level idempotency checks prevent duplicate command creation
  - Database constraints prevent duplicate transactions
  - Gracefully handle constraint violations (treat as success if transaction already exists)

### Scenario 3: Duplicate Webhook Events
- **Impact**: Stripe may send duplicate events
- **Mitigation**: 
  - `lastPaymentIntentEventTimestamp` check prevents processing older events
  - Idempotency checks prevent duplicate ledger transactions
  - Database constraints as final safeguard

### Scenario 4: Partial Payment Success
- **Impact**: Invoice not fully paid, only `SettleInvoiceUsageCostsLedgerCommand` should execute
- **Mitigation**: 
  - Conditional command creation based on invoice status
  - Only create `BillingPeriodTransitionLedgerCommand` if invoice is fully paid

## Testing Strategy

### Test Migration for `processTerminalPaymentIntent`

**Current Test Coverage** (in `billingRunHelpers.test.ts`):

1. **Usage Credit Grants Tests** (lines 3055-3637):
   - `should grant a "Once" usage credit after payment confirmation`
   - `should grant an "EveryBillingPeriod" usage credit after payment confirmation`
   - **What they test**: That `BillingPeriodTransitionLedgerCommand` correctly grants usage credits based on subscription features
   - **Migration**: Update to call `processPaymentIntentEventForBillingRun` with new signature `{ paymentIntent: Stripe.PaymentIntent, lastEventTimestamp: Date }` instead of `processTerminalPaymentIntent(paymentIntent, billingRun, transaction)`

2. **Ledger Command Creation Tests** (lines 3639-3914):
   - `should NOT create billing period transition ledger command if one already exists for this billing period` (idempotency test)
   - `should NOT create billing period transition ledger command when invoice is not paid`
   - `should NOT create billing period transition ledger command when billing run status is not Succeeded`
   - **What they test**: Conditional creation of `BillingPeriodTransitionLedgerCommand` based on invoice status, billing run status, and idempotency
   - **Migration**: Update to test `processPaymentIntentEventForBillingRun` and verify both `SettleInvoiceUsageCostsLedgerCommand` and `BillingPeriodTransitionLedgerCommand` are created conditionally

**Migration Steps**:

1. **Audit existing tests**:
   - Review all tests in `billingRunHelpers.test.ts` that use `processTerminalPaymentIntent`
   - Document what each test is verifying
   - Identify which tests can be removed vs. migrated

2. **Update test structure**:
   - Change from calling `processTerminalPaymentIntent(paymentIntent, billingRun, transaction)` 
   - To calling `processPaymentIntentEventForBillingRun(input, transaction)` with new signature
   - Use payment intent format for synchronous test scenarios:
     ```typescript
     await processPaymentIntentEventForBillingRun(
       {
         paymentIntent: paymentIntent,
         lastEventTimestamp: new Date(),
       },
       transaction
     )
     ```
   - Use event format for webhook test scenarios:
     ```typescript
     await processPaymentIntentEventForBillingRun(
       { event: paymentIntentEvent },
       transaction
     )
     ```

3. **Update assertions**:
   - Tests should verify `ledgerCommands` array contains expected commands
   - Verify both `SettleInvoiceUsageCostsLedgerCommand` and `BillingPeriodTransitionLedgerCommand` when appropriate
   - Verify neither command when conditions aren't met

4. **Add new test cases**:
   - Test that both commands are created in a single transaction
   - Test idempotency for both commands (not just billing period transition)
   - Test that `SettleInvoiceUsageCostsLedgerCommand` is created independently of billing period transition

5. **Remove or deprecate**:
   - If `processTerminalPaymentIntent` is removed entirely, delete its test suite
   - If kept for backward compatibility, mark tests as deprecated and add migration notes

### Unit Tests
- Test `processPaymentIntentEventForBillingRun` returns correct `ledgerCommands` array
- Test command creation logic for both commands
- Test conditional command creation based on invoice/billing run status
- Test transaction isolation

### Integration Tests
- Test full flow: payment intent success → both commands execute atomically
- Test error scenarios (one command fails, both fail)
- Test idempotency (what if commands are executed twice?)
- Test race conditions (synchronous + webhook)

### Edge Cases
- Payment succeeds but invoice not fully paid (only `SettleInvoiceUsageCostsLedgerCommand` should execute)
- Multiple payment intents for same billing run
- Concurrent payment intent events
- Billing run status changes between command creation attempts

## Success Metrics

1. **Code Quality**:
   - All ledger commands created in one workflow
   - Clear separation between data gathering and command execution
   - No breaking changes to existing functionality

2. **Reliability**:
   - Both commands execute successfully for billing run payments
   - Error handling prevents data inconsistency
   - Transaction isolation maintained

3. **Maintainability**:
   - Clear code flow in `stripePaymentIntentSucceededTask`
   - Easy to add new ledger commands in the future
   - Well-documented decision points

## Implementation Checklist

### Pull Request 1: Multiple Ledger Command Support
- [ ] Update `TransactionOutput` to support `ledgerCommands` array
- [ ] Modify `comprehensiveAdminTransaction` to combine `ledgerCommand` and `ledgerCommands` into single array
- [ ] Process all commands from combined array
- [ ] Update `comprehensiveAuthenticatedTransaction` if needed

### Pull Request 2: Idempotency Checks in Ledger Manager
- [ ] Add `extractIdempotencyKey` helper function with switch case for all command types
- [ ] Import `selectLedgerTransactions` and `selectLedgerEntries` from table methods
- [ ] Add idempotency check at start of `processLedgerCommand` before switch statement
- [ ] Query for existing transaction using extracted idempotency key
- [ ] If existing transaction found, return it with its entries (idempotent retry)
- [ ] If no existing transaction, proceed with normal processing via switch statement
- [ ] Remove duplicate idempotency check from `processBillingPeriodTransitionLedgerCommand`
- [ ] Add tests for idempotency scenarios across multiple command types

### Pull Request 3: Business Logic Changes
- [ ] Update `processPaymentIntentEventForBillingRun` function signature
- [ ] Support both event format and payment intent format
- [ ] Move `processTerminalPaymentIntent` logic into `processPaymentIntentEventForBillingRun`
- [ ] Create both ledger commands in same function
- [ ] Update `stripePaymentIntentSucceededTask` to use new signature
- [ ] Update `executeBillingRun` to use new signature
- [ ] Deprecate `processTerminalPaymentIntent` function
- [ ] Audit and migrate test cases from `billingRunHelpers.test.ts`
- [ ] Add tests for new function signature (both formats)
- [ ] Add tests for both commands being created
- [ ] Add tests for conditional command creation
- [ ] Add tests for race conditions
- [ ] Update documentation

---

**Last Updated**: 2025-01-XX  
**Status**: Planning  
**Related Files**:
- `platform/flowglad-next/src/trigger/stripe/payment-intent-succeeded.ts`
- `platform/flowglad-next/src/subscriptions/processBillingRunPaymentIntents.ts`
- `platform/flowglad-next/src/subscriptions/billingRunHelpers.ts`
- `platform/flowglad-next/src/db/adminTransaction.ts`
- `platform/flowglad-next/src/db/ledgerManager/ledgerManager.ts`
- `platform/flowglad-next/src/db/ledgerManager/settleInvoiceUsageCostsLedgerCommand.ts`

