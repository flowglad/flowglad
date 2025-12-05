# @flowglad/better-auth-plugin

[![npm version](https://img.shields.io/npm/v/@flowglad/better-auth-plugin.svg)](https://www.npmjs.com/package/@flowglad/better-auth-plugin)

Better Auth plugin for integrating Flowglad's billing and subscription management with Better Auth.

## Prerequisites

- Better Auth installed in your project
- A Flowglad account and API key

## Installation

```bash
npm install @flowglad/better-auth-plugin better-auth
# or
yarn add @flowglad/better-auth-plugin better-auth
# or
bun add @flowglad/better-auth-plugin better-auth
```

## Quick Start

1. Add the plugin to your Better Auth configuration:

```typescript
import { betterAuth } from "better-auth"
import { flowgladPlugin } from "@flowglad/better-auth-plugin"

export const auth = betterAuth({
  plugins: [
    flowgladPlugin({
      // apiKey optional - reads from FLOWGLAD_SECRET_KEY env var
      // baseURL optional - defaults to https://app.flowglad.com
      customerType: "user", // or "organization"
    })
  ]
})
```

2. Use Flowglad methods in your server code:

```typescript
import { auth } from "@/lib/auth"

// Get billing information
const billing = await auth.billing.getBilling()

// Check feature access
const canSend = billing.checkFeatureAccess("messages")

// Create checkout session
const checkoutSession = await auth.billing.createCheckoutSession({
  priceId: "price_123",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
})
```

## Configuration

### Options

- `apiKey` (optional): Your Flowglad API key. If not provided, reads from `FLOWGLAD_SECRET_KEY` environment variable.
- `baseURL` (optional): Flowglad API base URL. Defaults to `https://app.flowglad.com`.
- `customerType` (optional): Type of customer to use. Either `"user"` or `"organization"`. Defaults to `"user"`.
- `getCustomer` (optional): Custom function to extract customer info from Better Auth session. If not provided, uses defaults based on `customerType`.

## License

MIT

