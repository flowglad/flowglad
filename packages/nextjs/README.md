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
    >
      {children}
    </FlowgladProvider>
  );
}

// In your components
import { useBilling, usePricing } from '@flowglad/nextjs';

function BillingComponent() {
  const pricingModel = usePricing();
  const { 
    customer,
    subscriptions,
    paymentMethods,
    createCheckoutSession,
    cancelSubscription,
    loaded,
    errors 
  } = useBilling();

  if (!loaded || !pricingModel) {
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
      
      <button
        disabled={!pricingModel.products[0]?.defaultPrice}
        onClick={() =>
          createCheckoutSession({
            successUrl: 'https://your-app.com/success',
            cancelUrl: 'https://your-app.com/cancel',
            priceSlug: pricingModel.products[0]?.defaultPrice?.slug,
          })
        }
      >
        Subscribe
      </button>
    </div>
  );
}
```

### Route Handlers

#### App Router

```typescript
import { nextRouteHandler } from '@flowglad/nextjs/server';
import { flowglad } from '@/lib/flowglad';
import { verifyToken } from '@/lib/auth';

// Create the route handler with customer ID extraction
export const { GET, POST } = nextRouteHandler({
  getCustomerExternalId: async (req) => {
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) throw new Error('Unauthorized');
    const decoded = await verifyToken(token);
    return decoded.userId;
  },
  flowglad,
});
```

#### Pages Router

```typescript
import { pagesRouteHandler } from '@flowglad/nextjs/server';
import { flowglad } from '@/lib/flowglad';
import { verifyToken } from '@/lib/auth';

// Create the route handler with customer ID extraction
export default pagesRouteHandler({
  getCustomerExternalId: async (req) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Unauthorized');
    const decoded = await verifyToken(token);
    return decoded.userId;
  },
  flowglad,
});
```

The route handlers will automatically:
- Parse the request path from the URL
- Handle query parameters (normalized for Pages Router)
- Process request bodies for non-GET requests

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
