# Step 4: Frontend Provider Setup

## Objective

Wrap your application with `FlowgladProvider` to enable client-side billing access.

## Overview

`FlowgladProvider` is a React context provider that:
1. Fetches billing data from your API route when `loadBilling` is `true`
2. Provides billing data to all child components via the `useBilling` hook
3. Handles loading, error, and refresh states

## Key Prop: `loadBilling`

The `loadBilling` prop controls when billing data is fetched:
- `true` - Fetch billing data (user is authenticated)
- `false` - Don't fetch (user is not authenticated)

This prevents unnecessary API calls for unauthenticated users.

## Next.js (App Router)

### With Supabase Auth

```tsx
// app/layout.tsx
import { PropsWithChildren } from 'react'
import { FlowgladProvider } from '@flowglad/nextjs'
import { createClient } from '@/utils/supabase/server'

export default async function RootLayout({
  children,
}: PropsWithChildren) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  return (
    <html lang="en">
      <body>
        <FlowgladProvider loadBilling={!!user}>
          {children}
        </FlowgladProvider>
      </body>
    </html>
  )
}
```

### With Clerk

```tsx
// app/layout.tsx
import { PropsWithChildren } from 'react'
import { FlowgladProvider } from '@flowglad/nextjs'
import { currentUser } from '@clerk/nextjs/server'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await currentUser()
  
  return (
    <html lang="en">
      <body>
        <FlowgladProvider loadBilling={!!user}>
          {children}
        </FlowgladProvider>
      </body>
    </html>
  )
}
```

### With NextAuth

```tsx
// app/layout.tsx
import { PropsWithChildren } from 'react'
import { FlowgladProvider } from '@flowglad/nextjs'
import { auth } from '@/lib/auth'

export default async function RootLayout({
  children,
}: PropsWithChildren) {
  const session = await auth()
  
  return (
    <html lang="en">
      <body>
        <FlowgladProvider loadBilling={!!session?.user}>
          {children}
        </FlowgladProvider>
      </body>
    </html>
  )
}
```

### With Better Auth

Better Auth requires a client-side wrapper to handle reactive session changes:

```tsx
// components/providers.tsx
'use client'

import { FlowgladProvider } from '@flowglad/nextjs'
import { authClient } from '@/lib/auth-client'

export function Providers({ children }: { children: React.ReactNode }) {
  // Use Better Auth's useSession to watch for session changes reactively
  const { data: session } = authClient.useSession()
  
  // Derive loadBilling from session state reactively
  // This ensures billing loads when session becomes available
  const loadBilling = !!session?.user
  
  return (
    <FlowgladProvider loadBilling={loadBilling}>
      {children}
    </FlowgladProvider>
  )
}
```

```tsx
// app/layout.tsx
import { Providers } from '@/components/providers'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
```

## Provider Props

```typescript
interface FlowgladProviderProps {
  // Required: Whether to load billing data
  loadBilling: boolean
  
  // Optional: Custom server route (default: '/api/flowglad')
  serverRoute?: string
  
  // Optional: Custom headers for requests
  requestConfig?: {
    headers?: Record<string, string>
  }
  
  children: React.ReactNode
}
```

## Custom Server Route

If your API route is at a different path:

```tsx
<FlowgladProvider 
  loadBilling={!!user}
  serverRoute="/api/billing" // Custom path
>
  {children}
</FlowgladProvider>
```

## Custom Headers

If you need to pass custom headers (e.g., for API authentication):

```tsx
<FlowgladProvider 
  loadBilling={!!user}
  requestConfig={{
    headers: {
      'X-Custom-Header': 'value',
      'Authorization': `Bearer ${token}`,
    },
  }}
>
  {children}
</FlowgladProvider>
```

## Nested Providers

If you have other providers, `FlowgladProvider` can be nested anywhere:

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <FlowgladProvider loadBilling={!!user}>
              {children}
            </FlowgladProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

## React (Non-Next.js)

For React apps with a custom backend:

```tsx
// App.tsx or main.tsx
import { FlowgladProvider } from '@flowglad/react'
import { useAuth } from './auth' // Your auth hook

function App() {
  const { user, isAuthenticated } = useAuth()
  
  return (
    <FlowgladProvider loadBilling={isAuthenticated}>
      <Router>
        <Routes />
      </Router>
    </FlowgladProvider>
  )
}
```

## Verification

Verify the provider is working by checking billing data in a component:

```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function BillingStatus() {
  const { loaded, loadBilling, errors, customer } = useBilling()
  
  if (!loadBilling) {
    return <div>Billing not enabled (user not authenticated)</div>
  }
  
  if (!loaded) {
    return <div>Loading billing data...</div>
  }
  
  if (errors?.length) {
    return <div>Error loading billing: {errors[0].message}</div>
  }
  
  return (
    <div>
      <p>Customer: {customer?.name}</p>
      <p>Email: {customer?.email}</p>
    </div>
  )
}
```

## Common Issues

### Billing doesn't load after login

If billing doesn't load when a user logs in, ensure `loadBilling` is reactive:

```tsx
// ❌ Bad: Static value from server
const user = await getUser()
<FlowgladProvider loadBilling={!!user}>

// ✅ Good: Reactive value from client hook
const { user } = useAuth()
<FlowgladProvider loadBilling={!!user}>
```

### Provider not at root level

Make sure `FlowgladProvider` wraps all components that need billing access:

```tsx
// ❌ Bad: Provider inside page
function Page() {
  return (
    <FlowgladProvider loadBilling={true}>
      <PricingTable />
    </FlowgladProvider>
  )
}

// ✅ Good: Provider in layout (wraps all pages)
function Layout({ children }) {
  return (
    <FlowgladProvider loadBilling={!!user}>
      {children}
    </FlowgladProvider>
  )
}
```

## Next Step

Proceed to **Step 5: Using the useBilling Hook** to access billing data in your components.

