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

```typescript
// Import the transaction function and methods you need
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomerById, updateCustomer } from '@/db/tableMethods/customerMethods'

// Use in API routes/procedures
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

// Admin transactions bypass RLS for system operations
await adminTransaction(async ({ transaction }) => {
  // Can access all data across all organizations
  const allInvoices = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.status, 'pending'))
}, { livemode: true })
```

### 3. Complex Business Logic with Events and Ledger

```typescript
import { comprehensiveAuthenticatedTransaction } from '@/db/authenticatedTransaction'

const result = await comprehensiveAuthenticatedTransaction(async (params) => {
  const { transaction, organizationId } = params
  
  // Perform business logic
  const invoice = await createInvoice(data, transaction)
  
  // Return with events and ledger commands
  return {
    result: invoice,
    eventsToLog: [{
      type: 'invoice.created',
      data: { invoiceId: invoice.id }
    }],
    ledgerCommand: new CreditAdjustmentCommand(amount)
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
  selectPaginatedCustomers,      // Cursor-based pagination
  upsertCustomerByExternalId,   // Insert or update
  updateCustomer,                // Update existing
  deleteCustomer                 // Delete record
} from '@/db/tableMethods/customerMethods'

// Use with transactions
const customer = await selectCustomerById(id, transaction)

// Pagination example
const { records, nextCursor } = await selectPaginatedCustomers({
  where: { organizationId },
  limit: 20,
  cursor: previousCursor
}, transaction)
```

## How to Modify

### 1. Adding a New Table

1. Create schema file in `/db/schema/`:

```typescript
// db/schema/myNewTable.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const myNewTable = pgTable('my_new_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizationsTable.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  // Add indexes
  orgIdx: index().on(table.organizationId)
}))
  .enableRLS()  // Enable Row Level Security
  .$withPolicies([
    // Add RLS policies
    pgPolicy('read_own', {
      as: 'permissive',
      to: 'authenticated',
      for: 'select',
      using: sql`organization_id = current_organization_id()`
    })
  ])
```

2. Create table methods in `/db/tableMethods/`:

```typescript
// db/tableMethods/myNewTableMethods.ts
import { createSelectById, createUpsertFunction } from '../tableUtils'
import { myNewTable } from '../schema/myNewTable'

const config = {
  tableName: 'my_new_table',
  selectSchema: myNewTableSelectSchema,
  insertSchema: myNewTableInsertSchema,
  updateSchema: myNewTableUpdateSchema
}

export const selectMyNewTableById = createSelectById(myNewTable, config)
export const upsertMyNewTableByName = createUpsertFunction(
  myNewTable,
  ['name', 'organizationId'],
  config
)
```

3. Run migrations to create the table:

```bash
pnpm db:generate
pnpm db:migrate
```

### 2. Modifying Existing Tables

1. Update the schema file with new columns:

```typescript
// Add to existing table definition
newColumn: text('new_column').default('default_value')
```

2. Generate and run migration:

```bash
pnpm db:generate
pnpm db:migrate
```

3. Update the Zod schemas if needed:

```typescript
// In the schema file
export const tableInsertSchema = enhancedCreateInsertSchema(table, {
  newColumn: z.string().optional()
})
```

### 3. Adding Complex Business Logic

For operations involving multiple tables or complex logic:

1. Create a new function using transactions:

```typescript
// src/someFeature/complexOperation.ts
export async function processComplexBilling(
  customerId: string,
  params: { apiKey: string }
) {
  return comprehensiveAuthenticatedTransaction(async ({ transaction, organizationId }) => {
    // 1. Validate customer
    const customer = await selectCustomerById(customerId, transaction)
    if (!customer) throw new Error('Customer not found')
    
    // 2. Create invoice
    const invoice = await upsertInvoice({
      customerId,
      organizationId,
      amount: calculateAmount()
    }, transaction)
    
    // 3. Process payment
    const payment = await createPayment({
      invoiceId: invoice.id,
      amount: invoice.amount
    }, transaction)
    
    // 4. Return with events and ledger updates
    return {
      result: { invoice, payment },
      eventsToLog: [{
        type: 'billing.processed',
        data: { customerId, invoiceId: invoice.id }
      }],
      ledgerCommand: new BillingProcessedCommand(payment)
    }
  }, params)
}
```

### 4. Working with the Ledger System

For financial operations requiring audit trails:

```typescript
import { LedgerManager } from '@/db/ledgerManager'
import { AdminCreditAdjustedLedgerCommand } from '@/db/ledgerManager/commands'

// Create a ledger command
const command = new AdminCreditAdjustedLedgerCommand({
  customerId,
  amount: 1000,  // In cents
  description: 'Manual credit adjustment'
})

// Process through ledger manager
await adminTransaction(async ({ transaction }) => {
  const manager = new LedgerManager(transaction)
  await manager.processCommand(command)
})
```

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
Always use Zod schemas for input validation:
```typescript
const validated = customerInsertSchema.parse(inputData)
```

### 7. **Error Handling**
Transactions automatically rollback on errors. Handle specific cases:
```typescript
try {
  await authenticatedTransaction(...)
} catch (error) {
  if (error.code === '23505') {  // Unique violation
    // Handle duplicate
  }
  throw error
}
```

## Testing Database Code

```typescript
// Use test transactions that rollback
import { createTestTransaction } from '@/db/testUtils'

test('should create customer', async () => {
  await createTestTransaction(async (transaction) => {
    const customer = await createCustomer(data, transaction)
    expect(customer.id).toBeDefined()
    // Transaction rolls back after test
  })
})
```

## Common Pitfalls to Avoid

1. **Don't bypass transactions** - Always use transaction wrappers
2. **Don't ignore RLS** - Test with actual user contexts
3. **Don't hardcode IDs** - Use UUIDs and let the database generate them
4. **Don't forget indexes** - Performance degrades quickly without proper indexing
5. **Don't mix admin and user operations** - Keep them separate for security
6. **Don't skip validation** - Always validate inputs with Zod schemas
7. **Don't ignore the ledger** - Financial operations must go through the ledger system

## Need Help?

- Check existing patterns in `/db/tableMethods/` for examples
- Review test files (`*.test.ts`) for usage patterns
- Look at `/db/tableUtils.ts` for available factory functions
- Consult Drizzle ORM docs for advanced queries