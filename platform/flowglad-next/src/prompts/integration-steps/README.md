# Flowglad Integration Steps

This directory contains step-by-step guides for integrating Flowglad into your application.

## Steps Overview

| Step | File | Description |
|------|------|-------------|
| 0 | `00-prerequisites.md` | Environment setup and API key configuration |
| 1 | `01-install-packages.md` | Install the correct Flowglad packages |
| 2 | `02-server-factory.md` | Create the FlowgladServer factory function |
| 3 | `03-api-route.md` | Set up the API route handler |
| 4 | `04-frontend-provider.md` | Configure FlowgladProvider in your app |
| 5 | `05-use-billing-hook.md` | Use the useBilling hook in components |
| 6 | `06-feature-access-usage.md` | Implement feature gating and usage tracking |
| 7 | `07-migrate-existing-billing.md` | Replace existing mock billing code |
| 8 | `08-final-verification.md` | Verify the integration is complete |

## Recommended Flow

1. **New Project**: Follow steps 0 → 1 → 2 → 3 → 4 → 5 → 6 → 8
2. **Existing Project with Mock Billing**: Follow steps 0 → 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8
3. **Server-Only Integration**: Follow steps 0 → 1 → 2 → 3 → 6 → 8 (skip frontend steps)

## Step Dependencies

```
Step 0 (Prerequisites)
    ↓
Step 1 (Install Packages)
    ↓
Step 2 (Server Factory)
    ↓
Step 3 (API Route)
    ↓
Step 4 (Frontend Provider)  ←── Skip if server-only
    ↓
Step 5 (useBilling Hook)    ←── Skip if server-only
    ↓
Step 6 (Feature Access & Usage)
    ↓
Step 7 (Migrate Existing)   ←── Skip if no existing billing code
    ↓
Step 8 (Final Verification)
```

## Usage with MCP

These steps are designed to be queried individually via the `getSetupInstructions` MCP tool:

```typescript
// Query a specific step
const step = await mcpTool.getSetupInstructions({ step: 2 })

// Query by name
const step = await mcpTool.getSetupInstructions({ step: 'server-factory' })
```

## Framework Support

| Framework | Supported Steps |
|-----------|-----------------|
| Next.js (App Router) | All steps |
| Next.js (Pages Router) | All steps (with minor adjustments) |
| Express.js | Steps 0, 1, 2, 3, 6, 8 |
| React (custom backend) | Steps 0, 1, 2, 3, 4, 5, 6, 8 |
| Server-only | Steps 0, 1, 2, 3, 6, 8 |

## Auth Library Support

Each step includes examples for:
- Supabase Auth
- Clerk
- NextAuth
- Better Auth
- Generic/custom auth

