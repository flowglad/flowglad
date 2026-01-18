# @flowglad/server

This package provides a server-side SDK for integrating with Flowglad.

## Installation

```bash
npm install @flowglad/server
# or
yarn add @flowglad/server
# or
bun add @flowglad/server
```

## Usage

```typescript
import { FlowgladServer } from '@flowglad/server'

const flowgladServer = new FlowgladServer({
  // optional - reads from FLOWGLAD_SECRET_KEY
  apiKey: 'your-api-key',
  // optional
  baseURL: 'https://app.flowglad.com',
  getRequestingCustomer: async () => {
    // Return the current customer
    return {
      externalId: 'user-123',
      name: 'John Doe',
      email: 'john@example.com',
    }
  },
})

// Get the customer ID
const customerId = await flowgladServer.getRequestingCustomerId()

// Get the customer session
const session = await flowgladServer.getSession()

// Find or create a customer
const customer = await flowgladServer.findOrCreateCustomer()

// Get customer billing information
const billing = await flowgladServer.getBilling()

// Get the pricing model
const { pricingModel } = await flowgladServer.getPricingModel()

// Create a subscription
const subscription = await flowgladServer.createSubscription({
  planId: 'plan-123',
  quantity: 1,
})

// Cancel a subscription
const canceledSubscription = await flowgladServer.cancelSubscription({
  id: 'sub-123',
  cancellation: {
    reason: 'customer-requested',
  },
})

// Create a usage event
const usageEvent = await flowgladServer.createUsageEvent({
  featureId: 'feature-123',
  quantity: 1,
  usageDate: new Date().toISOString(),
})

// Create a checkout session
const checkoutSession = await flowgladServer.createCheckoutSession({
  type: 'subscription',
  priceId: 'price-123',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
})
```

## Integration Tests

This package includes integration tests that test the FlowgladServer against a local implementation of flowglad-next.

### Prerequisites

- Node.js 18+
- bun
- Docker and Docker Compose

### Running Integration Tests Locally

1. Start the flowglad-next server:

```bash
cd platform/flowglad-next
bun run test:setup
bun run dev
```

2. In a new terminal, run the integration tests:

```bash
cd packages/server
bun run test:integration
```

### Running Integration Tests in CI

The integration tests are automatically run in CI when changes are made to the server package or the flowglad-next package.

## License

MIT 