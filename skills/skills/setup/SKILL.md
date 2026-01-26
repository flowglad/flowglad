---
name: flowglad-setup
description: Install and configure the Flowglad SDK for Next.js, Express, and React applications. Use this skill when adding billing to an app, setting up Flowglad for the first time, or configuring SDK providers and route handlers.
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/quickstart.mdx
  - platform/docs/sdks/setup.mdx
  - platform/docs/sdks/introduction.mdx
  - platform/docs/sdks/nextjs.mdx
  - platform/docs/sdks/server.mdx
  - platform/docs/snippets/setup-nextjs.mdx
  - platform/docs/snippets/setup-react.mdx
  - platform/docs/snippets/setup-server.mdx
-->

# Flowglad Setup

## Abstract

This skill covers installing and configuring the Flowglad SDK for Next.js, Express, and React applications. It includes framework detection, package installation, environment setup, server factory creation, route handler setup, and provider configuration.

---

## Table of Contents

1. [Framework Detection](#1-framework-detection) — **CRITICAL**
   - 1.1 [Detecting the Framework](#11-detecting-the-framework)
2. [Next.js Setup](#2-nextjs-setup) — **CRITICAL**
   - 2.1 [Package Installation](#21-package-installation)
   - 2.2 [Environment Variables](#22-environment-variables)
   - 2.3 [Server Factory Creation](#23-server-factory-creation)
   - 2.4 [API Route Handler](#24-api-route-handler)
   - 2.5 [FlowgladProvider Setup](#25-flowgladprovider-setup)
3. [Express Setup](#3-express-setup) — **HIGH**
   - 3.1 [Package Installation](#31-package-installation)
   - 3.2 [Server Factory Creation](#32-server-factory-creation)
   - 3.3 [Express Router Setup](#33-express-router-setup)
4. [React Setup (Other Frameworks)](#4-react-setup-other-frameworks) — **HIGH**
   - 4.1 [Package Installation](#41-package-installation)
   - 4.2 [FlowgladProvider Setup](#42-flowgladprovider-setup)
   - 4.3 [Backend Requirements](#43-backend-requirements)
5. [Customer ID Mapping](#5-customer-id-mapping) — **CRITICAL**
   - 5.1 [Using Your App's User ID](#51-using-your-apps-user-id)
   - 5.2 [Organization vs User Customers](#52-organization-vs-user-customers)
6. [getCustomerDetails Callback](#6-getcustomerdetails-callback) — **HIGH**
   - 6.1 [Required Fields](#61-required-fields)
   - 6.2 [Database Integration](#62-database-integration)

---

## 1. Framework Detection

**Impact: CRITICAL**

Before beginning setup, detect which framework the user is using to ensure correct package installation and configuration.

### 1.1 Detecting the Framework

**Impact: CRITICAL (incorrect detection leads to wrong SDK usage)**

Check for framework-specific configuration files to determine the correct setup path.

**Detection Rules:**

```text
Next.js:     next.config.js OR next.config.ts OR next.config.mjs exists
Express:     "express" in package.json dependencies
React (CRA): "react-scripts" in package.json dependencies
Vite React:  "vite" in package.json devDependencies AND "react" in dependencies
```

**Incorrect: assuming Next.js without checking**

```typescript
// Don't assume the framework - always verify first
import { FlowgladServer } from '@flowglad/nextjs/server'
// This will fail if the user is using Express or plain React
```

**Correct: check framework before recommending packages**

```bash
# Check for Next.js
ls next.config.* 2>/dev/null && echo "Next.js detected"

# Check for Express (in package.json)
grep -q '"express"' package.json && echo "Express detected"
```

After detection, proceed to the appropriate setup section.

---

## 2. Next.js Setup

**Impact: CRITICAL**

Next.js is the primary supported framework with the most streamlined integration.

### 2.1 Package Installation

**Impact: CRITICAL (wrong packages = broken integration)**

**Incorrect: installing individual packages separately**

```bash
# Don't install packages piecemeal
npm install @flowglad/server
npm install @flowglad/react
# Missing the unified Next.js package
```

**Correct: install the Next.js package (includes server and react)**

```bash
bun add @flowglad/nextjs @flowglad/react
```

The `@flowglad/nextjs` package re-exports server functionality and is designed for Next.js App Router.

### 2.2 Environment Variables

**Impact: CRITICAL (missing env vars = authentication failures)**

**Incorrect: hardcoding API key**

```typescript
// SECURITY RISK: Never hardcode secrets
const flowglad = new FlowgladServer({
  apiKey: 'sk_live_abc123...',
  // ...
})
```

**Correct: use environment variable**

```bash
# .env.local
FLOWGLAD_SECRET_KEY=sk_live_your_secret_key_here
```

```typescript
// The SDK automatically reads FLOWGLAD_SECRET_KEY from process.env
// No need to pass apiKey explicitly
const flowglad = new FlowgladServer({
  customerExternalId,
  getCustomerDetails,
})
```

The SDK automatically reads `FLOWGLAD_SECRET_KEY` from the environment. You only need to pass `apiKey` explicitly if using a different environment variable name.

### 2.3 Server Factory Creation

**Impact: CRITICAL (incorrect factory = broken billing operations)**

Create a factory function that returns a `FlowgladServer` instance scoped to a specific customer.

**Incorrect: creating a single shared instance**

```typescript
// lib/flowglad.ts
// BAD: Single shared instance loses customer context
export const flowglad = new FlowgladServer({
  // No customerExternalId - will fail for customer-specific operations
})
```

**Correct: factory function that creates scoped instances**

```typescript
// lib/flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { db } from '@/db'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId: string) => {
      const user = await db.users.findUnique({
        where: { id: externalId },
      })
      if (!user) {
        throw new Error(`User not found: ${externalId}`)
      }
      return {
        email: user.email,
        name: user.name || user.email,
      }
    },
  })
}
```

The factory pattern ensures each request gets a properly scoped server instance.

### 2.4 API Route Handler

**Impact: CRITICAL (missing route = SDK cannot communicate with Flowglad)**

Create a catch-all API route to handle Flowglad SDK requests from the frontend.

**Incorrect: manual route implementation**

```typescript
// app/api/flowglad/route.ts
// BAD: Manual implementation misses many endpoints
export async function POST(req: Request) {
  const body = await req.json()
  // Incomplete - missing proper routing, validation, etc.
  return Response.json({ error: 'Not implemented' })
}
```

**Correct: use nextRouteHandler with catch-all route**

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { auth } from '@/lib/auth' // Your auth solution
import { flowglad } from '@/lib/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    // Extract the authenticated user's ID from your auth system
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('Unauthorized')
    }
    return session.user.id
  },
})
```

**Important:** The route must be a catch-all (`[...path]`) to handle all Flowglad API subroutes.

### 2.5 FlowgladProvider Setup

**Impact: CRITICAL (missing provider = hooks don't work)**

Wrap your application with `FlowgladProvider` to enable the `useBilling` hook.

**Incorrect: not wrapping the app**

```tsx
// app/layout.tsx
// BAD: useBilling will throw without FlowgladProvider
export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

**Correct: wrap with FlowgladProvider**

```tsx
// app/layout.tsx
import { FlowgladProvider } from '@flowglad/react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <FlowgladProvider>{children}</FlowgladProvider>
      </body>
    </html>
  )
}
```

For apps with a custom API base URL:

```tsx
<FlowgladProvider baseURL="https://api.yourapp.com">
  {children}
</FlowgladProvider>
```

---

## 3. Express Setup

**Impact: HIGH**

For Express applications, use the `@flowglad/server` package with the Express router helper.

### 3.1 Package Installation

**Impact: HIGH (wrong package = missing Express utilities)**

**Incorrect: installing the Next.js package for Express**

```bash
# Wrong package for Express
npm install @flowglad/nextjs
```

**Correct: install the server package**

```bash
bun add @flowglad/server
```

### 3.2 Server Factory Creation

**Impact: HIGH (same pattern as Next.js)**

**Incorrect: not providing getCustomerDetails**

```typescript
// utils/flowglad.ts
// BAD: Missing getCustomerDetails - customer creation will fail
export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    // getCustomerDetails is required!
  })
}
```

**Correct: provide complete factory**

```typescript
// utils/flowglad.ts
import { FlowgladServer } from '@flowglad/server'
import { db } from '../db'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId: string) => {
      const user = await db.users.findOne({ id: externalId })
      if (!user) {
        throw new Error(`User not found: ${externalId}`)
      }
      return {
        email: user.email,
        name: user.name,
      }
    },
  })
}
```

### 3.3 Express Router Setup

**Impact: HIGH (incorrect setup = broken API routes)**

**Incorrect: manually handling each route**

```typescript
// routes/flowglad.ts
// BAD: Manual route handling is error-prone and incomplete
import express from 'express'

const router = express.Router()

router.post('/checkout', async (req, res) => {
  // Manual implementation - missing validation, error handling, etc.
})

export { router }
```

**Correct: use expressRouter helper**

```typescript
// routes/flowglad.ts
import { expressRouter } from '@flowglad/server/express'
import type { Request } from 'express'
import { flowglad } from '../utils/flowglad'

export const flowgladRouter = expressRouter({
  flowglad,
  getCustomerExternalId: async (req: Request) => {
    // Extract customer ID from your auth middleware
    const userId = req.user?.id
    if (!userId) {
      throw new Error('Unauthorized')
    }
    return userId
  },
})
```

Mount the router in your Express app:

```typescript
// index.ts
import express from 'express'
import { flowgladRouter } from './routes/flowglad'

const app = express()

app.use(express.json())
app.use('/api/flowglad', flowgladRouter)

app.listen(3000)
```

---

## 4. React Setup (Other Frameworks)

**Impact: HIGH**

For React apps not using Next.js (Create React App, Vite, etc.), you need both frontend and backend setup.

### 4.1 Package Installation

**Impact: HIGH (frontend package only)**

```bash
bun add @flowglad/react
```

### 4.2 FlowgladProvider Setup

**Impact: HIGH (must point to your backend)**

**Incorrect: using FlowgladProvider without baseURL in non-Next.js apps**

```tsx
// App.tsx
// BAD: Assumes /api/flowglad exists, but CRA/Vite don't have API routes
import { FlowgladProvider } from '@flowglad/react'

function App() {
  return (
    <FlowgladProvider>
      <MyApp />
    </FlowgladProvider>
  )
}
```

**Correct: specify your backend URL**

```tsx
// App.tsx
import { FlowgladProvider } from '@flowglad/react'

function App() {
  return (
    <FlowgladProvider baseURL="https://api.yourapp.com">
      <MyApp />
    </FlowgladProvider>
  )
}
```

### 4.3 Backend Requirements

**Impact: HIGH (frontend SDK requires backend)**

The `@flowglad/react` package makes API calls to your backend. You must have a backend that:

1. Handles Flowglad API routes (use `@flowglad/server` with Express, Fastify, etc.)
2. Authenticates requests and extracts customer IDs
3. Forwards requests to Flowglad's API

**Incorrect: trying to use Flowglad client-side only**

```tsx
// BAD: Cannot call Flowglad API directly from browser
// API keys should never be exposed to the client
const billing = await fetch('https://api.flowglad.com/v1/...', {
  headers: { Authorization: `Bearer ${FLOWGLAD_SECRET_KEY}` }, // SECURITY RISK
})
```

**Correct: frontend calls your backend, backend calls Flowglad**

```text
Browser (React)  →  Your Backend (Express/etc)  →  Flowglad API
     ↑                        ↑                         ↑
 @flowglad/react        @flowglad/server         Flowglad servers
```

---

## 5. Customer ID Mapping

**Impact: CRITICAL**

Flowglad uses `customerExternalId` to link billing data to your application's users. This is YOUR app's user ID, not a Flowglad-generated ID.

### 5.1 Using Your App's User ID

**Impact: CRITICAL (wrong ID = billing attached to wrong user)**

**Incorrect: generating a new ID for Flowglad**

```typescript
// BAD: Don't create separate IDs for Flowglad
const flowgladCustomerId = crypto.randomUUID()

export const flowglad = (userId: string) => {
  return new FlowgladServer({
    customerExternalId: flowgladCustomerId, // Wrong! Not tied to your user
    // ...
  })
}
```

**Correct: use your existing user/organization ID**

```typescript
// Your user.id IS the customerExternalId
export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId, // This is your app's user.id or org.id
    getCustomerDetails: async (externalId) => {
      // externalId here is the same as customerExternalId
      const user = await db.users.findUnique({
        where: { id: externalId },
      })
      return { email: user.email, name: user.name }
    },
  })
}

// Usage: pass your user's ID directly
const billing = await flowglad(session.user.id).getBilling()
```

### 5.2 Organization vs User Customers

**Impact: HIGH (affects multi-tenant billing)**

For B2B apps with team/organization billing, use the organization ID as the customer ID.

**Incorrect: using user ID for organization billing**

```typescript
// BAD: Each team member creates separate billing
const getCustomerExternalId = async (req) => {
  const session = await auth()
  return session.user.id // Wrong for team billing!
}
```

**Correct: use organization ID for team billing**

```typescript
// For B2B apps with team billing
const getCustomerExternalId = async (req) => {
  const session = await auth()
  // Return the organization ID, not the user ID
  return session.user.organizationId
}
```

Choose your customer ID strategy based on your billing model:

| Billing Model | customerExternalId | Example |
|---------------|-------------------|---------|
| Per-user (B2C) | `user.id` | Consumer SaaS |
| Per-team (B2B) | `organization.id` | Team collaboration tools |
| Per-workspace | `workspace.id` | Multi-workspace apps |

---

## 6. getCustomerDetails Callback

**Impact: HIGH**

The `getCustomerDetails` callback is called when Flowglad needs to create a new customer record. It must return the customer's email and name.

### 6.1 Required Fields

**Impact: HIGH (missing fields = customer creation fails)**

**Incorrect: returning incomplete data**

```typescript
getCustomerDetails: async (externalId) => {
  const user = await db.users.findUnique({ where: { id: externalId } })
  return {
    email: user.email,
    // Missing name field!
  }
}
```

**Correct: return both email and name**

```typescript
getCustomerDetails: async (externalId) => {
  const user = await db.users.findUnique({ where: { id: externalId } })
  if (!user) {
    throw new Error(`User not found: ${externalId}`)
  }
  return {
    email: user.email,
    name: user.name || user.email, // Fallback to email if no name
  }
}
```

### 6.2 Database Integration

**Impact: HIGH (callback must access your user data)**

The callback receives the `customerExternalId` and should look up the corresponding user in your database.

**Incorrect: hardcoding customer details**

```typescript
// BAD: Hardcoded values don't represent real users
getCustomerDetails: async (externalId) => {
  return {
    email: 'test@example.com',
    name: 'Test User',
  }
}
```

**Correct: query your database**

```typescript
// Drizzle ORM example
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

getCustomerDetails: async (externalId) => {
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, externalId))
    .limit(1)

  if (!user) {
    throw new Error(`User not found: ${externalId}`)
  }

  return {
    email: user.email,
    name: user.name || 'Unknown',
  }
}
```

```typescript
// Prisma example
import { prisma } from '@/lib/prisma'

getCustomerDetails: async (externalId) => {
  const user = await prisma.user.findUnique({
    where: { id: externalId },
    select: { email: true, name: true },
  })

  if (!user) {
    throw new Error(`User not found: ${externalId}`)
  }

  return {
    email: user.email,
    name: user.name || user.email,
  }
}
```

---

## Complete Next.js Setup Example

Here's a complete setup for a Next.js application:

**1. Install packages:**

```bash
bun add @flowglad/nextjs @flowglad/react
```

**2. Set environment variable:**

```bash
# .env.local
FLOWGLAD_SECRET_KEY=sk_live_your_key_here
```

**3. Create server factory (`lib/flowglad.ts`):**

```typescript
import { FlowgladServer } from '@flowglad/nextjs/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const [user] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, externalId))
        .limit(1)

      if (!user) {
        throw new Error(`User not found: ${externalId}`)
      }

      return {
        email: user.email,
        name: user.name || user.email,
      }
    },
  })
}
```

**4. Create API route (`app/api/flowglad/[...path]/route.ts`):**

```typescript
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { auth } from '@/lib/auth'
import { flowglad } from '@/lib/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async () => {
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('Unauthorized')
    }
    return session.user.id
  },
})
```

**5. Add FlowgladProvider (`app/layout.tsx`):**

```tsx
import { FlowgladProvider } from '@flowglad/react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <FlowgladProvider>{children}</FlowgladProvider>
      </body>
    </html>
  )
}
```

**6. Use in components:**

```tsx
'use client'

import { useBilling } from '@flowglad/react'

export function BillingStatus() {
  const { loaded, customer, currentSubscription } = useBilling()

  if (!loaded) return <div>Loading...</div>
  if (!customer) return <div>Please sign in</div>

  return (
    <div>
      <p>Plan: {currentSubscription?.product?.name || 'Free'}</p>
    </div>
  )
}
```

---

## References

- [Flowglad Documentation](https://docs.flowglad.com)
- [Next.js Integration Guide](https://docs.flowglad.com/frameworks/nextjs)
- [Express Integration Guide](https://docs.flowglad.com/frameworks/express)
