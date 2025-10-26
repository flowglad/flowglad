# @flowglad/react

[![npm version](https://img.shields.io/npm/v/@flowglad/react.svg)](https://www.npmjs.com/package/@flowglad/react)
[![npm bundle size](https://img.shields.io/bundlephobia/min/@flowglad/react)](https://bundlephobia.com/package/@flowglad/react)

React components and hooks for integrating FlowGlad's billing and subscription management into your React applications. This package provides a complete solution for handling subscriptions, payment methods, and billing information in your React frontend.

## Prerequisites

This package requires a FlowGlad server instance to communicate with. You can set up the server using the `@flowglad/server` package. See the [server package documentation](https://www.npmjs.com/package/@flowglad/server) for setup instructions.

## Installation

```bash
npm install @flowglad/react
# or
yarn add @flowglad/react
# or
bun add @flowglad/react
```

## Quick Start

1. Set up the FlowGladProvider in your app:

```tsx
import { FlowgladProvider } from '@flowglad/react';

export default function RootLayout({ children }) {
  return (
    <FlowgladProvider
      loadBilling={true} // Set to true if you want to load billing data
      requestConfig={{
        headers: {
          // Add any custom headers here
        }
      }}
      theme={{
        mode: 'dark',
        dark: {
          background: '#1b1b1b',
          card: 'rgb(35 35 35)'
        }
      }}
    >
      {children}
    </FlowgladProvider>
  );
}
```

2. Use the billing page component:

```tsx
import { BillingPage } from '@flowglad/react';

export default function Billing() {
  return (
    <BillingPage 
      className="custom-class" 
      darkMode={true}
    />
  );
}
```

## Features

- Complete billing management UI components
- Customizable themes with dark mode support
- Type-safe hooks for accessing billing data
- Integration with FlowGlad's server SDK
- Support for subscriptions, payment methods, and invoices

## API Reference

### Components

#### FlowgladProvider

The main provider component that must wrap your application to enable FlowGlad functionality.

```tsx
<FlowgladProvider
  loadBilling={boolean}
  requestConfig={{
    headers?: Record<string, string>
  }}
  theme={{
    mode?: 'light' | 'dark'
    dark?: {
      background?: string
      card?: string
      // ... other theme properties
    }
  }}
>
  {children}
</FlowgladProvider>
```

#### BillingPage

A complete billing management page component that includes:
- Current subscription display
- Pricing table for new subscriptions
- Payment method management
- Billing details
- Invoice history

```tsx
<BillingPage
  className?: string
  darkMode?: boolean
/>
```

### Hooks

#### useBilling

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
}
```

## Theme Customization

The FlowGladProvider accepts a theme configuration object that allows you to customize the appearance of all FlowGlad components:

```tsx
<FlowgladProvider
  theme={{
    mode: 'dark',
    dark: {
      background: '#1b1b1b',
      card: 'rgb(35 35 35)',
      // Add more theme properties as needed
    }
  }}
>
  {children}
</FlowgladProvider>
```

## Server Integration

This package is designed to work with the `@flowglad/server` package. Make sure you have set up the server routes in your backend application. The server package provides the necessary API endpoints that this React package communicates with.

## Development

This package is built using:
- TypeScript
- React
- Tailwind CSS for styling

## License

MIT
