# Test Cases for processPaymentIntentSucceeded - Anonymous Customer Checkout

## Function Analysis

The `processPaymentIntentSucceeded` function (in `stripe/payment-intent-succeeded.ts`) handles successful payment intents and has two main paths:

1. **Billing Run Path**: When metadata contains `billingRunId`
2. **Checkout Session Path**: When processing regular checkout sessions

For anonymous customer checkout sessions, we need to test the **Checkout Session Path** which:
- Calls `processPaymentIntentStatusUpdated` 
- Which calls `processStripeChargeForCheckoutSession`
- Which calls `processPurchaseBookkeepingForCheckoutSession`
- Which calls `createCustomerBookkeeping` (our new anonymous customer creation)

## Test Scenarios

### Scenario 1: Anonymous Customer with New Email
**Setup:**
- Create organization with product and price
- Create anonymous checkout session (no existing customer)
- Create successful payment intent with new email
- Mock Stripe charge data

**Expected Side Effects:**
- Customer record created with:
  - Correct email from checkout session
  - Correct name from checkout session  
  - Pricing model ID assigned
  - Stripe customer ID linked
  - Organization ID properly set
- Purchase record created and linked to customer
- Events generated for customer creation
- Ledger commands executed
- Invoice created for purchase

### Scenario 2: Anonymous Customer with Existing Email
**Setup:**
- Create organization with product and price
- Create existing customer with same email
- Create anonymous checkout session
- Create successful payment intent

**Expected Side Effects:**
- Should link to existing customer (not create duplicate)
- Purchase record linked to existing customer
- Events generated for purchase (not customer creation)
- Ledger commands executed
- Invoice created for purchase

### Scenario 3: Anonymous Customer with Stripe Customer ID
**Setup:**
- Create organization with product and price
- Create anonymous checkout session
- Create successful payment intent with Stripe customer ID
- Mock Stripe charge with customer data

**Expected Side Effects:**
- Customer record created with Stripe customer ID
- Stripe customer properly linked
- All other side effects as Scenario 1

### Scenario 4: Anonymous Customer with Different Pricing Models
**Setup:**
- Create organization with multiple products/prices
- Create anonymous checkout session with specific price
- Create successful payment intent

**Expected Side Effects:**
- Customer created with correct pricing model
- Purchase linked to correct price/product
- Events and ledger reflect correct pricing

### Scenario 5: Anonymous Customer with Discount Applied
**Setup:**
- Create organization with product, price, and discount
- Create anonymous checkout session with discount code
- Create successful payment intent

**Expected Side Effects:**
- Customer created normally
- Purchase created with discount applied
- Discount redemption record created
- Events include discount information
- Ledger commands include discount

### Scenario 6: Error Handling - Invalid Payment Intent
**Setup:**
- Create organization and checkout session
- Create payment intent with invalid metadata
- Attempt to process

**Expected Behavior:**
- Should throw appropriate error
- No customer should be created
- No side effects should occur

### Scenario 7: Error Handling - Missing Stripe Charge
**Setup:**
- Create organization and checkout session
- Create payment intent without latest_charge
- Attempt to process

**Expected Behavior:**
- Should throw error about missing charge
- No customer should be created
- No side effects should occur

## Test Data Requirements

### Database Setup:
- Organization with product and price
- Optional: Existing customer for duplicate email test
- Optional: Discount for discount test
- Checkout session records
- Payment intent records

### Mock Data:
- Stripe charge objects
- Stripe customer data
- Payment intent metadata
- Billing details

### Assertions:
- Customer record exists with correct fields
- Purchase record exists and linked properly
- Events table contains customer creation events
- Ledger commands executed
- Invoice created and linked
- No duplicate customers created
- Proper error handling for invalid cases

## Integration Points to Test

1. **Customer Creation**: `createCustomerBookkeeping` called with correct parameters
2. **Purchase Creation**: Purchase linked to customer and checkout session
3. **Event Generation**: Customer creation events properly stored
4. **Ledger Processing**: Ledger commands executed atomically
5. **Stripe Integration**: Stripe customer ID properly linked
6. **Invoice Creation**: Invoice created for purchase
7. **Transaction Atomicity**: All operations succeed or fail together
