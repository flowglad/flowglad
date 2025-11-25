# Step 2: Server Factory Setup

## Objective

Create a Flowglad server factory function that integrates with your authentication system.

## Understanding the Server Factory

The server factory is a function that creates a `FlowgladServer` instance scoped to a specific customer. This pattern allows Flowglad to:

1. Identify customers using YOUR app's IDs (not Flowglad's IDs)
2. Automatically create/find customers in Flowglad
3. Fetch customer details from your database when needed

## Key Concept: `customerExternalId`

`customerExternalId` is the ID from **YOUR app's database**, NOT Flowglad's customer ID.

- **B2C apps:** Use `user.id` (the user's ID in your database)
- **B2B apps:** Use `organization.id` or `team.id` (the billing entity's ID)

Flowglad uses this external ID to create and identify customers in its system.

## Implementation

### Next.js

Create `utils/flowglad.ts` (or `lib/flowglad.ts`):

```typescript
// utils/flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

/**
 * Factory function to create a FlowgladServer instance for a customer.
 * 
 * @param customerExternalId - The ID from YOUR app's database (user.id for B2C, organization.id for B2B)
 */
export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      // Fetch customer details from YOUR database using YOUR app's ID
      // Replace this with your actual database query
      const user = await db.users.findOne({ id: externalId })
      
      if (!user) {
        throw new Error('Customer not found')
      }
      
      return {
        email: user.email,
        name: user.name,
      }
    },
  })
}
```

### Express

Create `utils/flowglad.ts`:

```typescript
// utils/flowglad.ts
import { FlowgladServer } from '@flowglad/express'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const user = await db.users.findOne({ id: externalId })
      
      if (!user) {
        throw new Error('Customer not found')
      }
      
      return {
        email: user.email,
        name: user.name,
      }
    },
  })
}
```

### Generic Node.js Server

```typescript
// utils/flowglad.ts
import { FlowgladServer } from '@flowglad/server'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const user = await db.users.findOne({ id: externalId })
      
      if (!user) {
        throw new Error('Customer not found')
      }
      
      return {
        email: user.email,
        name: user.name,
      }
    },
  })
}
```

## Auth Library Examples

### With Supabase Auth

```typescript
import { FlowgladServer } from '@flowglad/nextjs/server'
import { createClient } from '@/utils/supabase/server'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const supabase = createClient()
      
      // Option 1: If using Supabase auth users table
      const { data: user } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', externalId)
        .single()
      
      if (!user) {
        throw new Error('Customer not found')
      }
      
      return {
        email: user.email,
        name: user.name || user.email,
      }
    },
  })
}
```

### With Clerk

```typescript
import { FlowgladServer } from '@flowglad/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const user = await clerkClient.users.getUser(externalId)
      
      return {
        email: user.emailAddresses[0]?.emailAddress || '',
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
      }
    },
  })
}
```

### With NextAuth

```typescript
import { FlowgladServer } from '@flowglad/nextjs/server'
import { prisma } from '@/lib/prisma'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const user = await prisma.user.findUnique({
        where: { id: externalId },
      })
      
      if (!user) {
        throw new Error('Customer not found')
      }
      
      return {
        email: user.email!,
        name: user.name || user.email!,
      }
    },
  })
}
```

### With Better Auth

```typescript
import { FlowgladServer } from '@flowglad/nextjs/server'
import { db } from '@/lib/db'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, externalId),
      })
      
      if (!user) {
        throw new Error('Customer not found')
      }
      
      return {
        email: user.email,
        name: user.name || user.email,
      }
    },
  })
}
```

## B2B Apps (Organization-based billing)

For B2B apps where organizations/teams are billed (not individual users):

```typescript
import { FlowgladServer } from '@flowglad/nextjs/server'

// Use organization ID as customerExternalId
export const flowglad = (organizationId: string) => {
  return new FlowgladServer({
    customerExternalId: organizationId, // Organization ID, not user ID
    getCustomerDetails: async (externalId) => {
      const organization = await db.organizations.findOne({ id: externalId })
      
      if (!organization) {
        throw new Error('Organization not found')
      }
      
      return {
        email: organization.billingEmail || organization.ownerEmail,
        name: organization.name,
      }
    },
  })
}
```

## Configuration Options

```typescript
interface FlowgladServerOptions {
  // Required: ID from YOUR database
  customerExternalId: string
  
  // Required: Fetch customer details from your database
  getCustomerDetails: (externalId: string) => Promise<{
    name: string
    email: string
  }>
  
  // Optional: Override the base URL (for self-hosted or testing)
  baseURL?: string
  
  // Optional: Override the API key (defaults to FLOWGLAD_SECRET_KEY)
  apiKey?: string
}
```

## Verification

Test your server factory by fetching billing data:

```typescript
// Test in an API route or server action
const userId = 'your-test-user-id'
const billing = await flowglad(userId).getBilling()
console.log('Customer:', billing.customer)
console.log('Subscriptions:', billing.subscriptions)
```

## Next Step

Proceed to **Step 3: API Route Setup** to create the Flowglad API route handler.

