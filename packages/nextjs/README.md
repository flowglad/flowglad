# @flowglad/nextjs

A Next.js integration package for Flowglad, providing utilities for both client and server-side functionality.

## Installation

```bash
npm install @flowglad/nextjs
# or
yarn add @flowglad/nextjs
# or
bun add @flowglad/nextjs
```

## Requirements

- React 18 or 19
- Next.js 14, 15, or 16

## Usage

### Client-side Components

Import client-side components and utilities directly from the package:

```typescript
import { Component } from '@flowglad/nextjs';
```

### Server-side Code

For server-side code, use the dedicated server import path:

```typescript
import { serverFunction } from '@flowglad/nextjs/server';
```

This separation ensures proper code splitting and prevents server-only code from being included in client bundles.

## Features

- App Router Support
- Pages Router Support
- Type-safe route handlers
- Server-side utilities
- Client-side components
- React Context for billing and subscription management

## API Reference

### React Context

The package provides a React context for managing billing and subscription state. Here's how to use it:

```typescript
// In your app's root layout or page
import { FlowgladProvider } from '@flowglad/nextjs';

export default function RootLayout({ children }) {
  return (
    <FlowgladProvider
      baseURL="https://your-app.com" // Base URL of your app (optional, defaults to relative /api/flowglad)
      loadBilling={true} // Set to true to load billing data
    >
      {children}
    </FlowgladProvider>
  );
}

// In your components
import { useBilling } from '@flowglad/nextjs';

function BillingComponent() {
  const { 
    customer,
    subscriptions,
    paymentMethods,
    createCheckoutSession,
    cancelSubscription,
    loaded,
    errors 
  } = useBilling();

  if (!loaded) {
    return <div>Loading...</div>;
  }

  if (errors) {
    return <div>Error: {errors[0].message}</div>;
  }

  return (
    <div>
      <h2>Current Subscriptions</h2>
      {subscriptions?.map(sub => (
        <div key={sub.id}>
          {sub.name} - {sub.status}
          <button onClick={() => cancelSubscription({ subscriptionId: sub.id })}>
            Cancel
          </button>
        </div>
      ))}
      
      <button onClick={() => createCheckoutSession({
        successUrl: 'https://your-app.com/success',
        cancelUrl: 'https://your-app.com/cancel',
        priceId: 'price_123'
      })}>
        Subscribe
      </button>
    </div>
  );
}
```

### Route Handlers

#### App Router

```typescript
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server';
import { FlowgladServer } from '@flowglad/nextjs/server';

// Create your FlowgladServer instance
const flowgladServer = new FlowgladServer();

// Create the route handler
const handler = createAppRouterRouteHandler(flowgladServer);

// Export the handler for the HTTP method you want to support
export const GET = handler;
export const POST = handler;
// etc...
```

#### Pages Router

```typescript
import { createPagesRouterRouteHandler } from '@flowglad/nextjs/server';
import { FlowgladServer } from '@flowglad/nextjs/server';

// Create your FlowgladServer instance
const flowgladServer = new FlowgladServer();

// Create the route handler
const handler = createPagesRouterRouteHandler(flowgladServer);

// Export the handler as the default export
export default handler;
```

The route handlers will automatically:
- Parse the request path from the URL
- Handle query parameters (normalized for Pages Router)
- Process request bodies for non-GET requests

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
