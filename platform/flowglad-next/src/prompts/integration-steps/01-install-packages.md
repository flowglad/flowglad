# Step 1: Install Flowglad Packages

## Objective

Install the correct Flowglad SDK packages for your framework.

## Framework-Specific Installation

### Next.js (App Router or Pages Router)

```bash
# Using bun (recommended)
bun add @flowglad/nextjs

# Using npm
npm install @flowglad/nextjs

# Using yarn
yarn add @flowglad/nextjs

# Using pnpm
pnpm add @flowglad/nextjs
```

**Important:** `@flowglad/nextjs` includes both server and React client functionality. Do NOT separately install `@flowglad/react` or `@flowglad/server` - they are bundled within `@flowglad/nextjs`.

### Express.js

```bash
# Using bun (recommended)
bun add @flowglad/express

# Using npm
npm install @flowglad/express

# Using yarn
yarn add @flowglad/express
```

**Note:** `@flowglad/express` includes `@flowglad/server` as a dependency. For the frontend, also install `@flowglad/react` in your React app.

### React (Non-Next.js) + Custom Server

For React apps with a custom Node.js backend:

**Frontend (React app):**
```bash
bun add @flowglad/react
```

**Backend (Node.js server):**
```bash
bun add @flowglad/server
```

### Other TypeScript/Node.js Backends

For backends that aren't Express or Next.js:

```bash
bun add @flowglad/server
```

## Package Summary

| Your Stack | Install This |
|------------|--------------|
| Next.js (App/Pages Router) | `@flowglad/nextjs` |
| Express.js backend | `@flowglad/express` |
| React frontend (any) | `@flowglad/react` |
| Custom Node.js backend | `@flowglad/server` |

## What Each Package Provides

### `@flowglad/nextjs`
- `FlowgladServer` class for server-side operations
- `nextRouteHandler` for App Router API routes
- `FlowgladProvider` for React context
- `useBilling` hook for client components
- All exports from `@flowglad/react`

### `@flowglad/react`
- `FlowgladProvider` component
- `useBilling` hook
- Client-side billing types

### `@flowglad/server`
- `FlowgladServer` class
- `createFetchRequestHandler` for generic request handling
- Server-side billing operations

### `@flowglad/express`
- `createFlowgladExpressRouter` for Express routing
- All exports from `@flowglad/server`

## Verification

After installation, verify the packages are available:

```typescript
// For Next.js
import { FlowgladServer, nextRouteHandler } from '@flowglad/nextjs/server'
import { FlowgladProvider, useBilling } from '@flowglad/nextjs'

// For Express
import { createFlowgladExpressRouter, FlowgladServer } from '@flowglad/express'

// For React
import { FlowgladProvider, useBilling } from '@flowglad/react'

// For Server
import { FlowgladServer, createFetchRequestHandler } from '@flowglad/server'
```

## Next Step

Proceed to **Step 2: Server Factory Setup** to create your Flowglad server configuration file.

