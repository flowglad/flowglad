# Step 3: API Route Setup

## Objective

Create an API route that handles communication between your frontend and Flowglad.

## Overview

The API route serves as the backend endpoint that:
1. Authenticates the requesting user via YOUR auth system
2. Creates a scoped `FlowgladServer` instance for that user
3. Proxies billing requests to/from Flowglad

The default path is `/api/flowglad/[...path]` - this is where your frontend SDK will send requests.

## Next.js (App Router)

Create `app/api/flowglad/[...path]/route.ts`:

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    // Extract your user/organization ID from the request
    // This should be YOUR app's ID, not Flowglad's customer ID
    
    // Example: Extract from your auth system
    const userId = await getUserIdFromRequest(req)
    
    if (!userId) {
      throw new Error('User not authenticated')
    }
    
    return userId
  },
})
```

### Auth-Specific Implementations

#### With Supabase Auth

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'
import { createClient } from '@/utils/supabase/server'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }
    
    return user.id
  },
})
```

#### With Clerk

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'
import { auth } from '@clerk/nextjs/server'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const { userId } = auth()
    
    if (!userId) {
      throw new Error('User not authenticated')
    }
    
    return userId
  },
})
```

#### With NextAuth

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      throw new Error('User not authenticated')
    }
    
    return session.user.id
  },
})
```

#### With Better Auth

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const session = await auth.api.getSession({
      headers: headers(),
    })
    
    if (!session?.user?.id) {
      throw new Error('User not authenticated')
    }
    
    return session.user.id
  },
})
```

### B2B Apps (Organization-based)

For B2B apps, extract the organization ID instead:

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    // Get the user's current organization
    const session = await getSession()
    const organizationId = session?.user?.currentOrganizationId
    
    if (!organizationId) {
      throw new Error('No organization selected')
    }
    
    // Return organization ID, not user ID
    return organizationId
  },
})
```

## Express.js

Create an Express router for Flowglad:

```typescript
// routes/flowglad.ts
import { createFlowgladExpressRouter, FlowgladServer } from '@flowglad/express'

export const flowgladRouter = createFlowgladExpressRouter({
  flowgladServerConstructor: (req) => {
    // Extract user ID from your auth middleware
    const userId = req.user?.id
    
    if (!userId) {
      throw new Error('User not authenticated')
    }
    
    return new FlowgladServer({
      customerExternalId: userId,
      getCustomerDetails: async (externalId) => {
        const user = await db.users.findOne({ id: externalId })
        return {
          email: user.email,
          name: user.name,
        }
      },
    })
  },
})
```

Mount it in your Express app:

```typescript
// app.ts or index.ts
import express from 'express'
import { flowgladRouter } from './routes/flowglad'

const app = express()

app.use(express.json())

// Mount at /api/flowglad
app.use('/api/flowglad', flowgladRouter)

app.listen(3000)
```

## Generic Node.js Server

For other frameworks, use the generic fetch request handler:

```typescript
// routes/flowglad.ts
import { createFetchRequestHandler, FlowgladServer } from '@flowglad/server'

export const handleFlowgladRequest = async (req: Request) => {
  // Extract user ID from your auth system
  const userId = await getUserIdFromRequest(req)
  
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  const flowgladServer = new FlowgladServer({
    customerExternalId: userId,
    getCustomerDetails: async (externalId) => {
      const user = await db.users.findOne({ id: externalId })
      return {
        email: user.email,
        name: user.name,
      }
    },
  })
  
  const handler = createFetchRequestHandler({
    flowgladServer,
  })
  
  return handler(req)
}
```

## Route Handler Options

```typescript
nextRouteHandler({
  // Required: Your flowglad factory function
  flowglad,
  
  // Required: Function to extract customer ID from request
  getCustomerExternalId: async (req) => string,
  
  // Optional: Hook before processing request
  beforeRequest: async (req) => {
    // Log, validate, etc.
  },
  
  // Optional: Hook after processing request
  afterRequest: async (req, result) => {
    // Log, analytics, etc.
  },
  
  // Optional: Custom error handler
  onError: (error) => {
    console.error('Flowglad error:', error)
    // Optionally return a custom response
  },
})
```

## Custom Route Path

If you mount the route at a different path (e.g., `/api/billing`), you'll need to configure the frontend provider:

```tsx
// In your layout.tsx
<FlowgladProvider 
  loadBilling={!!user}
  serverRoute="/api/billing" // Custom path
>
  {children}
</FlowgladProvider>
```

## Verification

Test your route is working:

```bash
# Should return billing data (requires authentication)
curl http://localhost:3000/api/flowglad/billing \
  -H "Cookie: your-auth-cookie" \
  -H "Content-Type: application/json"
```

Or in your app:

```typescript
// Test in a Server Component or API route
const response = await fetch('http://localhost:3000/api/flowglad/billing', {
  credentials: 'include',
})
const data = await response.json()
console.log('Billing data:', data)
```

## Next Step

Proceed to **Step 4: Frontend Provider Setup** to configure the React context provider.

