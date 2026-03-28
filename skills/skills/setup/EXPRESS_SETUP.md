# Express Setup

For Express applications, use the `@flowglad/server` package with the Express router helper.

## Package Installation

```bash
bun add @flowglad/server
```

> **Note:** Do not install `@flowglad/nextjs` for Express projects -- use `@flowglad/server` instead.

## Server Factory Creation

Create a factory function that returns a scoped `FlowgladServer` instance per customer. Both `customerExternalId` and `getCustomerDetails` are required.

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

## Express Router Setup

Use the `expressRouter` helper to handle all Flowglad API routes automatically.

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
