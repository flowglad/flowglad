# Hosted Billing

This is the hosted billing portal we use for customers. It uses /[organizationId] via the route path and customerExternalId via the query param.

## Setup Instructions

0. Install dependencies and pull environment variables:
```bash
pnpm install-packages && pnpm vercel:env-pull
```

1. First start the API server via `pnpm dev` in platform/flowglad-next. Make sure it's running on port 3000

2. Start this server via `pnpm dev`

3. It should load
