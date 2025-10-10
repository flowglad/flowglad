# Anonymous Customer Creation System Architecture

This document provides a comprehensive overview of the anonymous customer creation system, including the complex event processing pipeline, transaction management, and the various components that work together to enable frictionless checkout experiences.

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagrams](#architecture-diagrams)
3. [Event Processing Pipeline](#event-processing-pipeline)
4. [Transaction Management](#transaction-management)
5. [Code Implementation](#code-implementation)
6. [Key Components](#key-components)

## System Overview

The anonymous customer creation system enables customers to make purchases without requiring authentication, while maintaining proper audit trails, pricing model assignments, and event tracking. The system uses a sophisticated "lazy account creation" pattern where customers can later create accounts and link their purchases.

### Core Principles
- **Frictionless Checkout**: No signup required for purchases
- **Smart Account Linking**: Multiple purchases automatically linked by email
- **Security-First**: Only creates accounts when explicitly requested
- **User-Controlled**: Customer decides when to create account
- **Complete Audit Trail**: All actions tracked through events

## Architecture Diagrams

### 1. System Flow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Customer Initiates Checkout] --> B[Create Checkout Session]
    B --> C[Payment Intent Created]
    C --> D[Customer Enters Payment Details]
    D --> E[Stripe Processes Payment]
    E --> F{Payment Status?}
    
    F -->|Succeeded| G[Trigger: payment-intent-succeeded]
    F -->|Failed| H[❌ Payment Failed]
    F -->|Pending| I[⏳ Payment Pending]
    
    G --> J[processPaymentIntentStatusUpdated]
    J --> K[processPurchaseBookkeepingForCheckoutSession]
    K --> L{Customer Exists?}
    
    L -->|Yes| M[Use Existing Customer]
    L -->|No| N[Anonymous Customer Creation Flow]
    
    N --> O[Get Default Pricing Model]
    O --> P{Default Pricing Model Found?}
    P -->|No| Q[❌ Error: No default pricing model]
    P -->|Yes| R[createCustomerBookkeeping]
    
    R --> S[Create Customer Record]
    S --> T[Create Stripe Customer]
    T --> U[Create Subscription & Items]
    U --> V[Generate Events]
    V --> W[Process Events Immediately]
    W --> X[Continue Purchase Processing]
    
    M --> X
    X --> Y[Generate Invoice PDF]
    X --> Z[Send Notifications]
    X --> AA[Complete Transaction]
    
    style N fill:#e1f5fe
    style R fill:#f3e5f5
    style V fill:#fff3e0
    style W fill:#e8f5e8
    style Q fill:#ffebee
```

### 2. Function-Level Data Flow Diagram (Mermaid)

```mermaid
flowchart TD
    A[stripePaymentIntentSucceededTask] -->|Stripe.PaymentIntentSucceededEvent| B[processPaymentIntentStatusUpdated]
    B -->|PaymentIntent object| C[processPurchaseBookkeepingForCheckoutSession]
    C -->|CheckoutSession + stripeCustomerId| D{Customer Exists?}
    
    D -->|No| E[selectDefaultPricingModel]
    E -->|PricingModel| F[createCustomerBookkeeping]
    F -->|Customer + Subscription + Events| G[bulkInsertOrDoNothingEventsByHash]
    G -->|void| H[updateCustomer]
    H -->|Updated Customer| I[Continue Purchase Processing]
    
    D -->|Yes| J[selectCustomerById]
    J -->|Existing Customer| I
    
    I -->|Purchase + Customer + Events| K[comprehensiveAdminTransaction]
    K -->|TransactionOutput| L[generateInvoicePdfIdempotently]
    K -->|TransactionOutput| M[sendCustomerPaymentSucceededNotificationIdempotently]
    K -->|TransactionOutput| N[sendOrganizationPaymentNotificationEmail]
    
    style F fill:#e1f5fe
    style G fill:#f3e5f5
    style K fill:#fff3e0
    style E fill:#e8f5e8
```

### 3. Detailed Function-Level Data Flow (Mermaid)

```mermaid
flowchart TD
    A[stripePaymentIntentSucceededTask] -->|Stripe.PaymentIntentSucceededEvent| B[processPaymentIntentStatusUpdated]
    B -->|PaymentIntent object| C[processPurchaseBookkeepingForCheckoutSession]
    C -->|CheckoutSession + stripeCustomerId| D{Customer Exists?}
    
    D -->|No| E[selectDefaultPricingModel]
    E -->|PricingModel| F[createCustomerBookkeeping 
    - `insertCustomer` - creates customer record
    - `createStripeCustomer` - creates Stripe customer
    - `updateCustomer` - updates customer with Stripe ID
    - `createSubscription` - creates subscription record
    - `createSubscriptionItems` - creates subscription items
    - `generateCustomerCreatedEvent` - generates customer event
    - `generateSubscriptionCreatedEvent` - generates subscription event]
    F -->|Customer + Subscription + Events| G[bulkInsertOrDoNothingEventsByHash]
    G -->|void| H[updateCustomer with provided Stripe ID]
    H -->|Updated Customer| I[Continue Purchase Processing]
    
    D -->|Yes| J[selectCustomerById]
    J -->|Existing Customer| I
    
    I -->|Purchase + Customer + Events| K[comprehensiveAdminTransaction]
    K -->|TransactionOutput| L[generateInvoicePdfIdempotently]
    K -->|TransactionOutput| M[sendCustomerPaymentSucceededNotificationIdempotently]
    K -->|TransactionOutput| N[sendOrganizationPaymentNotificationEmail]
    
    style F fill:#e1f5fe
    style G fill:#f3e5f5
    style K fill:#fff3e0
    style E fill:#e8f5e8
```

**Internal operations within `createCustomerBookkeeping`:**
- `insertCustomer` - creates customer record
- `createStripeCustomer` - creates Stripe customer
- `updateCustomer` - updates customer with Stripe ID
- `createSubscription` - creates subscription record
- `createSubscriptionItems` - creates subscription items
- `generateCustomerCreatedEvent` - generates customer event
- `generateSubscriptionCreatedEvent` - generates subscription event

### 4. Conditional Flow Diagram (Mermaid)

```mermaid
flowchart TD
    Start([Payment Intent Succeeded]) --> CheckMetadata{Check Metadata}
    
    CheckMetadata -->|Billing Run| BillingRun[Process Billing Run]
    CheckMetadata -->|Checkout Session| CheckoutFlow[Process Checkout Session]
    
    CheckoutFlow --> FindCustomer{Customer Exists?}
    
    FindCustomer -->|Yes| ExistingCustomer[Use Existing Customer]
    FindCustomer -->|No| AnonymousFlow[Anonymous Customer Creation]
    
    AnonymousFlow --> ValidatePricing{Pricing Model Available?}
    ValidatePricing -->|No| Error1[❌ Error: No pricing model]
    ValidatePricing -->|Yes| CreateCustomer[Create Customer with Pricing Model]
    
    CreateCustomer --> CreateStripe[Create Stripe Customer]
    CreateStripe --> CreateSubscription[Create Subscription & Items]
    CreateSubscription --> GenerateEvents[Generate Events]
    GenerateEvents --> ProcessEvents[Process Events Immediately]
    
    ProcessEvents --> ContinueFlow[Continue with Purchase]
    ExistingCustomer --> ContinueFlow
    ContinueFlow --> Complete[Transaction Complete]
    
    BillingRun --> Complete
    Error1 --> End([End with Error])
    
    style AnonymousFlow fill:#e1f5fe
    style CreateCustomer fill:#f3e5f5
    style GenerateEvents fill:#fff3e0
    style ProcessEvents fill:#e8f5e8
    style Error1 fill:#ffebee
```

### 3. Network/Request-Response Diagram (Mermaid)

```mermaid
sequenceDiagram
    participant C as Customer
    participant F as Frontend
    participant API as API Server
    participant T as Trigger.dev
    participant DB as Database
    participant S as Stripe
    participant E as Event System
    
    C->>F: Initiate Checkout
    F->>API: Create Checkout Session
    API->>DB: Store Checkout Session
    API->>S: Create Payment Intent
    S-->>API: Payment Intent Created
    API-->>F: Checkout Session + Payment Intent
    F-->>C: Payment Form
    
    C->>F: Submit Payment Details
    F->>S: Process Payment
    S-->>F: Payment Result
    
    alt Payment Succeeded
        S->>T: Webhook: payment_intent.succeeded
        T->>DB: processPaymentIntentStatusUpdated
        DB->>DB: Check Customer Exists
        
        alt Customer Not Found
            DB->>DB: Get Default Pricing Model
            DB->>DB: createCustomerBookkeeping
            DB->>S: Create Stripe Customer
            S-->>DB: Stripe Customer ID
            DB->>DB: Create Subscription & Items
            DB->>E: Generate Events
            E->>DB: Store Events
        end
        
        DB->>DB: Create Purchase & Invoice
        DB->>E: Generate Additional Events
        E->>DB: Store Events
        T-->>S: Webhook Processed
        
        T->>T: Generate Invoice PDF
        T->>T: Send Notifications
    else Payment Failed
        S->>T: Webhook: payment_intent.payment_failed
        T->>DB: Log Failure
    end
```

## Event Processing Pipeline

### Event Types Generated

1. **CustomerCreated**: When a new customer is created
2. **SubscriptionCreated**: When a subscription is created for the customer
3. **PaymentSucceeded**: When payment is successfully processed
4. **PurchaseCompleted**: When the purchase is finalized

### Event Processing Flow

```mermaid
flowchart LR
    A[createCustomerBookkeeping] --> B[Generate Events]
    B --> C[Return eventsToInsert]
    C --> D[processPurchaseBookkeepingForCheckoutSession]
    D --> E[bulkInsertOrDoNothingEventsByHash]
    E --> F[Events Stored in Database]
    F --> G[comprehensiveAdminTransaction]
    G --> H[Process Additional Events]
    H --> I[Complete Transaction]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style E fill:#fff3e0
    style F fill:#e8f5e8
```

## Transaction Management

### Transaction Types

1. **adminTransaction**: Basic admin operations
2. **comprehensiveAdminTransaction**: Admin operations with event processing
3. **authenticatedTransaction**: User-scoped operations
4. **comprehensiveAuthenticatedTransaction**: User-scoped operations with event processing

### Transaction Flow

```mermaid
flowchart TD
    A[Transaction Start] --> B{Transaction Type?}
    
    B -->|Admin| C[adminTransaction]
    B -->|Comprehensive Admin| D[comprehensiveAdminTransaction]
    B -->|Authenticated| E[authenticatedTransaction]
    B -->|Comprehensive Authenticated| F[comprehensiveAuthenticatedTransaction]
    
    C --> G[Basic Database Operations]
    D --> H[Database Operations + Event Processing]
    E --> I[User-Scoped Operations]
    F --> J[User-Scoped Operations + Event Processing]
    
    H --> K[Process eventsToInsert]
    J --> K
    K --> L[bulkInsertOrDoNothingEventsByHash]
    L --> M[Process ledgerCommand]
    M --> N[Complete Transaction]
    
    G --> N
    I --> N
    
    style D fill:#e1f5fe
    style F fill:#f3e5f5
    style K fill:#fff3e0
    style L fill:#e8f5e8
```

## Code Implementation

### Core Functions

#### 1. createCustomerBookkeeping

```typescript
export const createCustomerBookkeeping = async (
  payload: {
    customer: Omit<Customer.Insert, 'livemode'>
  },
  {
    transaction,
    organizationId,
    livemode,
    userId, // Optional for anonymous customers
  }: Omit<AuthenticatedTransactionParams, 'userId'> & { userId?: string }
): Promise<TransactionOutput<{
  customer: Customer.Record
  subscription?: Subscription.Record
  subscriptionItems?: SubscriptionItem.Record[]
}>>
```

**Key Features:**
- Supports both authenticated and anonymous customers
- Validates organizationId for authenticated users only
- Requires pricing model for anonymous customers
- Creates Stripe customer automatically
- Generates subscription and subscription items
- Returns events for audit trail

#### 2. processPurchaseBookkeepingForCheckoutSession

```typescript
export const processPurchaseBookkeepingForCheckoutSession = async (
  {
    checkoutSession,
    stripeCustomerId: providedStripeCustomerId,
  }: {
    checkoutSession: CheckoutSession.Record
    stripeCustomerId: string | null
  },
  transaction: DbTransaction
): Promise<{
  purchase: Purchase.Record
  customer: Customer.Record
  discount?: Discount.Record
  feeCalculation: FeeCalculation.Record
  discountRedemption?: DiscountRedemption.Record
  eventsToInsert: Event.Insert[]
}>
```

**Key Features:**
- Handles both existing and new customers
- Uses createCustomerBookkeeping for anonymous customers
- Processes events immediately after customer creation
- Returns events for further processing

#### 3. comprehensiveAdminTransaction

```typescript
export async function comprehensiveAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<TransactionOutput<T>>,
  options: AdminTransactionOptions = {}
): Promise<T>
```

**Key Features:**
- Processes eventsToInsert automatically
- Handles ledger commands
- Returns only the result part (not the full TransactionOutput)
- Ensures proper event storage

### Event Processing Implementation

```typescript
// In checkoutSessions.ts - Immediate event processing
if (customerBookkeepingResult.eventsToInsert && customerBookkeepingResult.eventsToInsert.length > 0) {
  await bulkInsertOrDoNothingEventsByHash(
    customerBookkeepingResult.eventsToInsert,
    transaction
  )
}
```

### Transaction Output Structure

```typescript
export interface TransactionOutput<T> {
  result: T
  eventsToInsert?: Event.Insert[]
  ledgerCommand?: LedgerCommand
}
```

## Key Components

### 1. Database Schema

#### Events Table
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type FlowgladEventType NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL,
  object_entity EventNoun,
  object_id INTEGER,
  hash TEXT UNIQUE NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id)
);
```

#### Customers Table
```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id), -- NULL for anonymous customers
  pricing_model_id TEXT NOT NULL REFERENCES pricing_models(id),
  stripe_customer_id TEXT,
  external_id TEXT NOT NULL,
  billing_address JSONB,
  livemode BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

### 2. Event Types

```typescript
export enum FlowgladEventType {
  CustomerCreated = 'CustomerCreated',
  SubscriptionCreated = 'SubscriptionCreated',
  PaymentSucceeded = 'PaymentSucceeded',
  PurchaseCompleted = 'PurchaseCompleted',
  // ... other event types
}
```

### 3. Transaction Parameters

```typescript
interface AdminTransactionParams {
  transaction: DbTransaction
  userId: string
  livemode: boolean
}

interface AuthenticatedTransactionParams {
  transaction: DbTransaction
  userId: string
  livemode: boolean
  organizationId: string
}
```

## Plain Text Explanation

### How the System Works

1. **Customer Checkout**: A customer visits a checkout page and enters their payment information without creating an account.

2. **Checkout Session Creation**: The system creates a checkout session with the customer's email and payment details, but no `userId` (indicating an anonymous customer).

3. **Payment Processing**: Stripe processes the payment and sends a webhook to the system when the payment succeeds.

4. **Customer Creation**: The system checks if a customer with that email already exists. If not, it creates a new anonymous customer with:
   - `userId: null` (indicating anonymous)
   - Default pricing model from the organization
   - Stripe customer ID for future payments
   - Subscription and subscription items if applicable

5. **Event Generation**: The system generates events for audit purposes:
   - `CustomerCreated` event
   - `SubscriptionCreated` event (if applicable)
   - `PaymentSucceeded` event
   - `PurchaseCompleted` event

6. **Event Processing**: Events are immediately processed and stored in the database using `bulkInsertOrDoNothingEventsByHash`.

7. **Transaction Completion**: The purchase is finalized, invoice is generated, and notifications are sent.

### Key Benefits

- **Frictionless Experience**: Customers can purchase without creating accounts
- **Complete Audit Trail**: All actions are tracked through events
- **Future Account Linking**: Customers can later create accounts and link their purchases
- **Proper Pricing**: Anonymous customers get the organization's default pricing model
- **Stripe Integration**: Automatic Stripe customer creation for future payments

### Security Considerations

- Anonymous customers have `userId: null` (not a fake user ID)
- RLS policies work correctly with null userId
- Organization validation only applies to authenticated users
- Pricing models are required for anonymous customers to prevent free access

### Error Handling

- If no default pricing model exists, customer creation fails
- If Stripe customer creation fails, the transaction is rolled back
- If event processing fails, the transaction is rolled back
- All errors are properly logged and tracked

This system provides a robust, secure, and user-friendly anonymous checkout experience while maintaining complete audit trails and proper business logic.
