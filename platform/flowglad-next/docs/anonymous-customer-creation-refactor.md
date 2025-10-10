# Anonymous Customer Creation Refactor

## Problem Statement

Customers created through anonymous checkout were not getting pricing models assigned automatically. The issue was that `processPurchaseBookkeepingForCheckoutSession` was using `insertCustomer` directly instead of `createCustomerBookkeeping`, which meant it missed the pricing model assignment and event creation logic.

## Root Cause Analysis

### Original Pattern (Working)
```typescript
// Anonymous checkout used insertCustomer directly
customer = await insertCustomer(
  {
    email: checkoutSession.customerEmail!,
    name: checkoutSession.customerName ?? checkoutSession.customerEmail!,
    organizationId: product.organizationId,
    billingAddress: checkoutSession.billingAddress,
    externalId: core.nanoid(),
    livemode: checkoutSession.livemode,
    // No userId field - defaults to null
  },
  transaction
)
```

### Attempted Fix (Problematic)
```typescript
// Attempted to use createCustomerBookkeeping with 'SYSTEM' userId
const customerBookkeepingResult = await createCustomerBookkeeping(
  { customer: { ... } },
  {
    transaction,
    organizationId: product.organizationId,
    livemode: checkoutSession.livemode,
    userId: 'SYSTEM', // Problematic approach
  }
)
```

## Issues with 'SYSTEM' Approach

1. **Database Constraint Violation**: `userId` is a foreign key to the `users` table, so 'SYSTEM' would need to exist as a real user
2. **RLS Policy Breaks**: Customer RLS policy `"user_id" = requesting_user_id()` would fail
3. **Billing Portal Access**: Anonymous customers couldn't access billing portal later
4. **Inconsistent with Design**: System is designed for `null userId` to represent anonymous customers

## Understanding the Lazy Account Creation Pattern

The system uses a sophisticated "lazy account creation" pattern:

### Phase 1: Anonymous Purchase
- Customer makes purchase without account
- Customer record created with `userId: null`
- No authentication required

### Phase 2: Later Account Creation (On-Demand)
- Customer requests billing portal access
- System creates Better Auth user account
- Links all customers with matching email to the new user account
- Customer gains access to billing features

### Benefits
- **Frictionless checkout** - No signup required for purchases
- **Smart account linking** - Multiple purchases automatically linked
- **Security-first** - Only creates accounts when explicitly requested
- **User-controlled** - Customer decides when to create account

## Solution Architecture

### Approach A: Anonymous as Core + Authenticated as Wrapper

```typescript
// Core function - handles anonymous customer creation (more permissive)
export const createAnonymousCustomerBookkeeping = async (
  payload: {
    customer: Omit<Customer.Insert, 'livemode' | 'userId'>
  },
  {
    transaction,
    organizationId,
    livemode,
    userId, // Optional - can be null for anonymous
  }: {
    transaction: DbTransaction
    organizationId: string
    livemode: boolean
    userId?: string | null
  }
) => {
  // All business logic: pricing model assignment, Stripe customer creation, events, etc.
}

// Thin wrapper for authenticated use
export const createCustomerBookkeeping = async (
  payload: {
    customer: Omit<Customer.Insert, 'livemode'>
  },
  {
    transaction,
    organizationId,
    livemode,
    userId, // Required
  }: AuthenticatedTransactionParams
) => {
  // Security validation
  if (payload.customer.organizationId && payload.customer.organizationId !== organizationId) {
    throw new Error('Customer organizationId must match authenticated organizationId')
  }
  
  // Delegate to core with required userId
  return createAnonymousCustomerBookkeeping(payload, {
    transaction,
    organizationId,
    livemode,
    userId, // Pass through the authenticated userId
  })
}
```

### Why This Approach?

1. **Simpler Architecture**: Only 2 functions instead of 3
2. **Natural Progression**: Anonymous → Authenticated feels intuitive
3. **Less Over-Engineering**: Fits the 2 use cases without unnecessary abstraction
4. **Clear Usage Patterns**: Function names clearly indicate their purpose
5. **Easier Migration**: Minimal changes to existing code

## Benefits of the Solution

### 1. Maintains Existing API
- All current `createCustomerBookkeeping` usage remains unchanged
- Same security guarantees and behavior
- No breaking changes

### 2. Proper Anonymous Customer Handling
- Anonymous customers get `userId: null` (correct design)
- Pricing models assigned automatically
- Events created properly
- Stripe customers created as needed

### 3. Lazy Account Creation Preserved
- Anonymous customers can later create accounts
- Billing portal linking works correctly
- Security model maintained

### 4. Clean Architecture
- Core function handles business logic
- Wrapper enforces authentication constraints
- Clear separation of concerns

## Implementation Plan

1. **Extract core logic** into `createAnonymousCustomerBookkeeping`
2. **Refactor existing function** to be a wrapper around the core
3. **Update checkout session** to use the anonymous function
4. **Maintain all existing behavior** for authenticated customer creation
5. **Add comprehensive tests** for anonymous customer creation

## Key Insights

1. **`userId` represents Flowglad user accounts**, not merchant customer IDs
2. **`null userId` is the correct pattern** for anonymous customers
3. **Lazy account creation** is a sophisticated UX pattern that should be preserved
4. **Architecture should reflect the natural flow**: Anonymous → Authenticated
5. **Simple solutions are often better** than over-engineered abstractions

## Files Modified

- `platform/flowglad-next/src/utils/bookkeeping.ts` - Extract core logic and create wrapper
- `platform/flowglad-next/src/utils/bookkeeping/checkoutSessions.ts` - Use anonymous function
- `platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts` - Add test coverage
- `platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts` - Handle events
- `platform/flowglad-next/src/utils/bookkeeping/processNonPaymentCheckoutSession.ts` - Handle events
- `platform/flowglad-next/src/utils/bookkeeping/processSetupIntent.ts` - Handle events
