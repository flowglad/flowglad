# @flowglad/react

[![npm version](https://img.shields.io/npm/v/@flowglad/react.svg)](https://www.npmjs.com/package/@flowglad/react)
[![npm bundle size](https://img.shields.io/bundlephobia/min/@flowglad/react)](https://bundlephobia.com/package/@flowglad/react)

React hooks and context provider for integrating Flowglad's billing and subscription management into your React applications. This package provides a complete solution for handling subscriptions, payment methods, and billing information in your React frontend.

## Prerequisites

This package requires a Flowglad server instance to communicate with. You can set up the server using the `@flowglad/server` package. See the [server package documentation](https://www.npmjs.com/package/@flowglad/server) for setup instructions.

## Installation

```bash
npm install @flowglad/react
# or
yarn add @flowglad/react
# or
bun add @flowglad/react
```

## Quick Start

1. Set up the FlowgladProvider in your app:

```tsx
import { FlowgladProvider } from '@flowglad/react';

export default function RootLayout({ children }) {
  return (
    <FlowgladProvider
      requestConfig={{
        headers: {
          // Add any custom headers here
        }
      }}
    >
      {children}
    </FlowgladProvider>
  );
}
```

2. Use the `useBilling` hook:

```tsx
import { useBilling } from '@flowglad/react';

export default function Billing() {
  const { checkFeatureAccess } = useBilling()
  if (!checkFeatureAccess) {
    return <div>Loading ...</div>  
  }
  if (checkFeatureAccess("my_feature")) {
    return <div>You have access!</div>
  } else {
    return <div>Please upgrade</div>
  }
}
```

## Features

- Type-safe hooks for accessing billing data
- Integration with Flowglad's server SDK
- Support for subscriptions, payment methods, invoices, and usage event tracking

## API Reference

### Components

#### FlowgladProvider

The main provider component that must wrap your application to enable Flowglad functionality.

```tsx
<FlowgladProvider
  requestConfig={{
    headers?: Record<string, string>
  }}
>
  {children}
</FlowgladProvider>
```

Billing data loads automatically when `useBilling` mounts. Use `usePricingModel`
or `usePricing` to fetch public pricing data without loading billing.

### useBilling

Access billing data and functions throughout your application:

```tsx
import { useBilling } from '@flowglad/react';

function MyComponent() {
  const billing = useBilling();
  
  // Access billing data
  const { customer, paymentMethods, invoices } = billing;
  
  // Create checkout session
  const handleSubscribe = () => {
    billing.createCheckoutSession({
      priceId: 'price_123',
      successUrl: window.location.href,
      cancelUrl: window.location.href,
      autoRedirect: true
    });
  };

  // Track usage events
  const handleUsage = async () => {
    const result = await billing.createUsageEvent({
      usageMeterSlug: 'api_calls',
      amount: 1
    });
    
    if ('error' in result) {
      console.error('Failed to record usage:', result.error);
    }
  };
}
```

## Server Integration

This package is designed to work with the `@flowglad/server` package. Make sure you have set up the server routes in your backend application. The server package provides the necessary API endpoints that this React package communicates with.

## License

MIT
