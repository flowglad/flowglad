# Database Layer Documentation

## What the heck is going on with this directory?

This directory contains Flowglad's entire database layer - a sophisticated, production-ready data access system built on **Drizzle ORM** with **PostgreSQL/Supabase**. It implements a multi-tenant SaaS billing and subscription management system with enterprise-grade security via Row Level Security (RLS), comprehensive transaction management, and double-entry bookkeeping for financial operations.

### Why would you use code in this directory?

- **Database Operations**: Any time you need to read/write data
- **Transaction Management**: When you need atomic operations across multiple tables
- **User Authentication**: To scope operations to specific users/organizations via RLS
- **Financial Operations**: For billing, invoicing, and ledger management
- **Schema Definitions**: To understand the data model and relationships

## Directory Structure

```
db/
├── client.ts                    # Main database client configuration
├── types.ts                     # Core type definitions (DbTransaction, etc.)
├── authenticatedTransaction.ts  # User-scoped transactions with RLS
├── adminTransaction.ts          # Admin-scoped transactions
├── schema/                      # All table definitions
│   ├── organizations.ts         # Multi-tenant orgs
│   ├── customers.ts            # Customer records
│   ├── subscriptions.ts        # Subscription models
│   ├── invoices.ts             # Invoice records
│   ├── payments.ts             # Payment tracking
│   └── [30+ more tables]       # Complete business model
├── tableMethods/               # Generated CRUD operations
│   └── *Methods.ts             # Standard operations per table
├── ledgerManager/              # Financial transaction processing
└── tableUtils.ts               # Schema and method factories
```

## How to Use

### 1. Basic Database Operations

**Key Rule**: Use `authenticatedTransaction` for ALL API/client-initiated operations, and `adminTransaction` for ALL background operations.

```typescript
// For API routes/procedures (client-initiated)
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomerById, updateCustomer } from '@/db/tableMethods/customerMethods'

const result = await authenticatedTransaction(async ({ transaction, organizationId }) => {
  // All operations are scoped to the authenticated user/org
  const customer = await selectCustomerById(customerId, transaction)
  
  // Update operations
  const updated = await updateCustomer({
    id: customerId,
    name: 'New Name'
  }, transaction)
  
  return updated
}, { apiKey: userApiKey })
```

### 2. Admin Operations (Background Jobs, System Tasks)

```typescript
import { adminTransaction } from '@/db/adminTransaction'

const ORGANIZATION_ID = 'org_foo'
// Use adminTransaction for ALL background operations (Trigger tasks, cron jobs, etc.)
await adminTransaction(async ({ transaction }) => {
  // Can access all data across all organizations
  const testmodeInvoices = await selectInvoices({
    organizationId: ORGANIZATION_ID
  }, transaction)
}, { livemode: true })
```

### 3. Complex Business Logic with Events and Ledger

```typescript
// For client-initiated operations with events/ledger
import { comprehensiveAuthenticatedTransaction } from '@/db/authenticatedTransaction'
import { Event } from '@/db/schema/events'
import { EventType, LedgerTransactionType } from '@/types'
import { constructPaymentSucceededEventHash } from '@/utils/eventHelpers'

const result = await comprehensiveAuthenticatedTransaction(async (params) => {
  const { transaction, organizationId } = params
  
  // Perform business logic (hypothetical code)
  const { invoice, invoiceLineItems } = await createInvoice(data, transaction)
  const payment = await selectPaymentById(invoice.paymentId, transaction)
  const eventsToInsert: Event.Insert[] = const eventInserts: Event.Insert[] = [
    {
      type: FlowgladEventType.PaymentSucceeded,
      occurredAt: new Date(),
      organizationId,
      livemode: invoice.livemode,
      payload: {
        object: EventNoun.Payment,
        id: payment.id,
      },
      submittedAt: timestamp,
      // always use a helper method to construct the event hash
      hash: constructPaymentSucceededEventHash(subscription),
      metadata: {},
      processedAt: null,
    },
  ]
  const invoiceLedgerCommand:
    | SettleInvoiceUsageCostsLedgerCommand
    | undefined =
    invoice.status === InvoiceStatus.Paid
      ? {
          type: LedgerTransactionType.SettleInvoiceUsageCosts,
          payload: {
            invoice,
            invoiceLineItems,
          },
          livemode: invoice.livemode,
          organizationId: invoice.organizationId,
          subscriptionId: invoice.subscriptionId!,
        }
      : undefined
  // Return with events and ledger commands
  return {
    result: invoice,
    eventsToInsert,
    ledgerCommand: invoiceLedgerCommand
  }
}, { apiKey })

```

### 4. Using Table Methods

Every table has generated methods following this pattern:

```typescript
// Import methods for a specific table
import {
  selectCustomerById,           // Get by ID
  selectCustomerByExternalId,   // Get by unique field
  selectCustomers,               // Query with filters
  upsertCustomerByExternalId,   // Insert or update
  updateCustomer,                // Update existing
} from '@/db/tableMethods/customerMethods'

// Use with transactions
const customer = await selectCustomerById(id, transaction)
```

## How to Modify

For adding new tables or modifying the database structure, follow the instructions in `platform/flowglad-next/llm-prompts/new-db-table.md`.

## Key Conventions to Follow

### 1. **Always Use Transactions**
Never access the database directly. Always use `authenticatedTransaction` or `adminTransaction`.

### 2. **Type Safety**
Use the generated types and schemas:
```typescript
import type { Customer } from '@/db/schema/customers'
// Customer.Insert - for creating
// Customer.Record - full database record
// Customer.ClientRecord - safe for client (no sensitive fields)
```

### 3. **RLS Compliance**
- User operations: Use `authenticatedTransaction`
- System operations: Use `adminTransaction`
- Always include `organizationId` in user-scoped queries

### 4. **Naming Conventions**
- Tables: `camelCase` with `Table` suffix (e.g., `customersTable`)
- Methods: `verb + TableName + Qualifier` (e.g., `selectCustomerById`)
- Schema files: Singular form (e.g., `customer.ts` not `customers.ts`)

### 5. **Index Everything**
Add indexes for:
- Foreign keys
- Frequently queried columns
- Unique constraints

### 6. **Schema Validation**
Use Zod schemas for both input AND output validation:
```typescript
// Validate inputs
const validated = customerInsertSchema.parse(inputData)

// Validate outputs for type safety
const customer = customerSelectSchema.parse(rawCustomerData)

// Use in API responses
const response = apiResponseSchema.parse({
  customer: customer,
  success: true
})
```


## Testing Database Code

```typescript
// Tests use real database operations with setup helpers
import { describe, it, expect, beforeEach } from 'bun:test'
import { adminTransaction } from '@/db/adminTransaction'
import { setupOrg, setupCustomer } from '@/../seedDatabase'
import { selectCustomers, updateCustomer } from './tableMethods/customerMethods'

describe('Customer operations', () => {
  let organizationId: string
  let customerId: string

  beforeEach(async () => {
    // Use seed helpers to set up test data
    const { organization } = await setupOrg()
    organizationId = organization.id
    
    const customer = await setupCustomer({
      organizationId,
      email: `test+${core.nanoid()}@test.com`
    })
    customerId = customer.id
  })

  it('should update customer email', async () => {
    await adminTransaction(async ({ transaction }) => {
      const updated = await updateCustomer(
        { id: customerId, email: 'new@example.com' },
        transaction
      )
      expect(updated.email).toBe('new@example.com')
    })
  })

  it('should select customers by organization', async () => {
    await adminTransaction(async ({ transaction }) => {
      const customers = await selectCustomers(
        { where: { organizationId } },
        transaction
      )
      expect(customers.length).toBeGreaterThan(0)
    })
  })
})
```

## Common Pitfalls to Avoid

1. **Don't bypass transactions** - Always use transaction wrappers
2. **Don't ignore RLS** - Test with actual user contexts
3. **Don't hardcode IDs** - Let the database generate them
4. **Don't forget indexes** - Performance degrades quickly without proper indexing
5. **Don't mix admin and user operations** - Keep them separate for security
6. **Don't skip validation** - Always validate inputs with Zod schemas
7. **Don't ignore the ledger** - Operations that impact usage tracking must go through the ledger system

## Need Help?

- Check existing patterns in `/db/tableMethods/` for examples
- Review test files (`*.test.ts`) for usage patterns
- Look at `/db/tableUtils.ts` for available factory functions
- Consult Drizzle ORM docs for advanced queries