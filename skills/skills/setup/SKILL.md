---
name: flowglad-setup
description: "Install and configure the Flowglad SDK for Next.js, Express, and React applications. Use this skill when adding billing to an app, setting up Flowglad for the first time, or configuring SDK providers and route handlers."
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-02-24T21:27:00Z
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

## Table of Contents

1. [Framework Detection](#1-framework-detection) — **CRITICAL**
2. [Next.js Setup](#2-nextjs-setup) — **CRITICAL**
   - 2.1 [Package Installation](#21-package-installation)
   - 2.2 [Environment Variables](#22-environment-variables)
   - 2.3 [Server Factory Creation](#23-server-factory-creation)
   - 2.4 [API Route Handler](#24-api-route-handler)
   - 2.5 [FlowgladProvider Setup](#25-flowgladprovider-setup)
   - 2.6 [Using Billing in Components](#26-using-billing-in-components)
3. [Express Setup](#3-express-setup) — **HIGH**
4. [React Setup (Other Frameworks)](#4-react-setup-other-frameworks) — **HIGH**
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

**Detection Rules:**

```text
Next.js:     next.config.js OR next.config.ts OR next.config.mjs exists
Express:     "express" in package.json dependencies
React (CRA): "react-scripts" in package.json dependencies
Vite React:  "vite" in package.json devDependencies AND "react" in dependencies
```

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

Install the unified Next.js package (includes server and react):

```bash
bun add @flowglad/nextjs @flowglad/react
```

The `@flowglad/nextjs` package re-exports server functionality and is designed for Next.js App Router. Do not install `@flowglad/server` separately for Next.js projects.

### 2.2 Environment Variables

**Incorrect: hardcoding API key (SECURITY RISK)**

```typescript
// SECURITY RISK: Never hardcode secrets
const flowglad = new FlowgladServer({
  apiKey: 'sk_live_abc123...',
})
```

**Correct: use environment variable**

```bash
# .env.local
FLOWGLAD_SECRET_KEY=sk_live_your_secret_key_here
```

The SDK automatically reads `FLOWGLAD_SECRET_KEY` from the environment. You only need to pass `apiKey` explicitly if using a different environment variable name.

### 2.3 Server Factory Creation

Create a factory function that returns a `FlowgladServer` instance scoped to a specific customer. Always use a factory -- never a single shared instance, which loses customer context.

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

### 2.4 API Route Handler

Create a catch-all API route to handle Flowglad SDK requests from the frontend. The route **must** be a catch-all (`[...path]`) to handle all Flowglad API subroutes.

```typescript
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { auth } from '@/lib/auth' // Your auth solution
import { flowglad } from '@/lib/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error('Unauthorized')
    }
    return session.user.id
  },
})
```

### 2.5 FlowgladProvider Setup

Wrap your application with `FlowgladProvider` to enable the `useBilling` hook. Without this provider, `useBilling` will throw.

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

### 2.6 Using Billing in Components

```tsx
'use client'

import { useBilling } from '@flowglad/react'

export function BillingStatus() {
  const { loaded, customer, currentSubscription } = useBilling()

  if (!loaded) return <div>Loading...</div>
  if (!customer) return <div>Please log in</div>

  return (
    <div>
      <p>Plan: {currentSubscription?.product?.name || 'Free'}</p>
    </div>
  )
}
```

---

## 3. Express Setup

**Impact: HIGH**

For Express applications, use the `@flowglad/server` package with the Express router helper.

See [EXPRESS_SETUP.md](./EXPRESS_SETUP.md) for complete Express integration instructions including package installation, server factory creation, and router setup.

**Quick start:**

```bash
bun add @flowglad/server
```

```typescript
import { expressRouter } from '@flowglad/server/express'

export const flowgladRouter = expressRouter({
  flowglad,
  getCustomerExternalId: async (req) => {
    const userId = req.user?.id
    if (!userId) throw new Error('Unauthorized')
    return userId
  },
})
```

---

## 4. React Setup (Other Frameworks)

**Impact: HIGH**

For React apps not using Next.js (Create React App, Vite, etc.), you need both frontend and backend setup.

See [REACT_SETUP.md](./REACT_SETUP.md) for complete instructions including provider configuration and backend requirements.

**Quick start:**

```bash
bun add @flowglad/react
```

```tsx
import { FlowgladProvider } from '@flowglad/react'

function App() {
  return (
    <FlowgladProvider baseURL="https://api.yourapp.com">
      <MyApp />
    </FlowgladProvider>
  )
}
```

> **Security:** Never call Flowglad's API directly from the browser. API keys must stay server-side. The frontend SDK communicates through your backend.

---

## 5. Customer ID Mapping

**Impact: CRITICAL**

Flowglad uses `customerExternalId` to link billing data to your application's users. This is YOUR app's user ID, not a Flowglad-generated ID.

### 5.1 Using Your App's User ID

Pass your existing user or organization ID directly as the `customerExternalId`. Do not generate a separate ID for Flowglad.

```typescript
// Your user.id IS the customerExternalId
export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId, // This is your app's user.id or org.id
    getCustomerDetails: async (externalId) => {
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

For B2B apps with team/organization billing, use the organization ID as the customer ID:

```typescript
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

The `getCustomerDetails` callback is called when Flowglad needs to create a new customer record. It must return both `email` and `name`.

### 6.1 Required Fields

Always return both `email` and `name`, with error handling for missing users:

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

The callback receives the `customerExternalId` and should look up the corresponding user in your database. Here are examples for common ORMs:

**Drizzle ORM:**

```typescript
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

**Prisma:**

```typescript
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

## References

- [Flowglad Documentation](https://docs.flowglad.com)
- [Next.js Integration Guide](https://docs.flowglad.com/frameworks/nextjs)
- [Express Integration Guide](https://docs.flowglad.com/frameworks/express)
