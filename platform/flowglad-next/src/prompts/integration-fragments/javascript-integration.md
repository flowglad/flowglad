## Integrating Flowglad in Javascript

To integrate Flowglad in your Javascript app, you are best served via our SDKs:

### Nextjs
Use **@flowglad/nextjs**

Note, that **@flowglad/nextjs** exports all of **@flowglad/react**. If you are using **@flowglad/nextjs** you should not install @flowglad/react separately. Follow the setup instructions in "React" below.

**Frontend Setup**

```tsx
// app/layout.tsx
import { PropsWithChildren } from 'react'
import { FlowgladProvider } from '@flowglad/react'
// or wherever you initialize your supabase client
import { createClient } from '@/utils/supabase'

export default async function RootLayout({
  children,
}: PropsWithChildren) {
    const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return (
    <FlowgladProvider>
    { /* ... existing layout JSX ... */}
      {children}
    { /* ... existing layout JSX ... */}
    </FlowgladProvider>
  )
}
```

**Note For Better Auth Apps**
If you use `better-auth`, consider a client-side `Providers` file that mounts `useSession` so client UI can respond to auth changes. FlowgladProvider no longer accepts a `loadBilling` prop.
```tsx
export function ProviderWrapper(props: { children: React.ReactNode }) {
  // Use BetterAuth's useSession to watch for session changes reactively
  const { data: session } = authClient.useSession();

  if (!session?.user) {
    return <>{props.children}</>;
  }

  return (
    <FlowgladProvider>
      {props.children}
    </FlowgladProvider>
  );
}
```

### React
Use **@flowglad/react**, which has the `useBilling` hook.

**Setup**
```tsx
//
<FlowgladProvider>

</FlowgladProvider>
```
### Express
- For Express backends, use **@flowglad/server** with the `/express` subpath

```ts
import { createFlowgladExpressRouter } from '@flowglad/server/express'
import { FlowgladServer } from '@flowglad/server'

export const flowgladRouter = createFlowgladExpressRouter({
  flowgladServerConstructor: req => {
    const userId = req.user.id // or however you derive your customer from a request
    return new FlowgladServer({
        customerExternalId: userId
    })
  },
})
```

```ts
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { flowgladRouter } from './routes/flowglad'

dotenv.config()

const app = express()
const port = process.env.PORT || 8000

app.use(cors())
app.use(express.json())

// Mount the flowglad router
app.use('/api/flowglad', flowgladRouter)

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
```

### All Other JS Backends
Use **@flowglad/server**, which ships the server SDK:

```ts
import { createFetchRequestHandler } from '@flowglad/server'
import { FlowgladServer } from '@flowglad/server'

export const flowgladRouteHandler = async (
  req: Request,
  res: Response
) => {
  // derive your customerExternalId from your request object
  // If your app is B2C: use user.id for the customerExternalId
  // If B2B: use organization.id (or team.id, etc.) for the customerExternalId
  const organization = await orgFromReq(req)
  const flowgladServer = new FlowgladServer({ customerExternalId: organization.id })
  const flowgladFetchRequestHandler = createFetchRequestHandler({
    flowgladServer,
    // optional fields: onError, beforeRequest, afterRequest
  })
  const result = await flowgladFetchRequestHandler(req)
  return result
}
```
