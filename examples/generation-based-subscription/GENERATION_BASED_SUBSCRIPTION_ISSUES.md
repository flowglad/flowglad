# Generation-Based Subscription – Code & Configuration Issues

## 1. Secrets committed in `.env.local`
- **Impact**: The repo leaks a live Supabase connection string, BetterAuth secret, and Flowglad secret (`sk_test_...`). Anyone with repo access can access the database and Flowglad account.
- **Evidence**: `.env.local:4-28` contains the production-looking credentials that should never be checked in.
- **Recommendation**: Remove `.env.local` from version control, rotate the exposed keys immediately, and use example files (`.env.example`) plus deployment secrets to supply values.

## 2. `.env.local` forces `NODE_ENV=development`
- **Impact**: Shipping this file to any environment pins `process.env.NODE_ENV` to `development`, disabling production optimizations and triggering warnings (`You are using a non-standard "NODE_ENV" value...`) during `next build`.
- **Evidence**: `.env.local:20-23` plus the warning emitted when running `bunx --bun next build`.
- **Recommendation**: Never set `NODE_ENV` manually in env files. Let Next.js manage it (`production` for builds, `development` locally).

## 3. BetterAuth secret fails open
- **Impact**: `auth.ts` falls back to an empty string when `BETTER_AUTH_SECRET` is missing, meaning session cookies can be forged instead of failing fast.
- **Evidence**: `src/lib/auth.ts:7-13` assigns `secret: process.env.BETTER_AUTH_SECRET ?? ''`.
- **Recommendation**: Throw when the secret is missing (similar to the `DATABASE_URL` guard) so the app cannot start with insecure crypto material.

## 4. Usage-event API trusts arbitrary client input
- **Impact**: `/api/usage-events` accepts whatever `usageMeterSlug` and `amount` the browser supplies. A malicious user can post negative amounts to refund their usage or reference usage meters they do not own.
- **Evidence**: `src/app/api/usage-events/route.ts:14-90` only checks that the fields exist; there is no allowlist, bounds checking, or cross-check that the meter belongs to the user’s subscription.
- **Recommendation**: Validate `usageMeterSlug` against the current subscription’s entitlements, ensure `amount` is a positive integer, and reject attempts to hit meters or prices the user does not own.

## 5. Paid users can be redirected away from the dashboard
- **Impact**: The “do I have a paid plan?” check only returns true if the customer has *zero* default (free) products. Anyone whose Flowglad catalog keeps a default plan alongside their paid subscription will be bounced back to `/pricing` despite paying.
- **Evidence**: `src/app/home-client.tsx:49-78` computes `hasNonDefaultPlan` as `!currentSubscriptions.some(product.default === true)` rather than checking for the presence of any non-default product.
- **Recommendation**: Change the logic to look for at least one subscription whose product is non-default instead of requiring the absence of default plans entirely.

## 6. Pricing cards never know the current plan
- **Impact**: `PricingCard` exposes an `isCurrentPlan` prop that disables checkout and labels the active plan, but `PricingCardsGrid` hard-codes `isCurrentPlan={false}` in both the carousel and grid renderers. Customers can therefore trigger a new checkout for the plan they already own and never see the “Current Plan” state.
- **Evidence**: `src/components/pricing-cards-grid.tsx:144-183` always passes `false`, while `src/components/pricing-card.tsx:156-177` relies on the prop to disable the CTA.
- **Recommendation**: Use `useBilling()` inside `PricingCardsGrid` (or compute the flag upstream) so each card knows whether its price matches the customer’s current subscription.

## 7. Auth client hard-codes `http://localhost:3000`
- **Impact**: When `NEXT_PUBLIC_BASE_URL` is not set (the default in many deployments), BetterAuth requests will still target `http://localhost:3000`, breaking sign-in/out in production and forcing insecure HTTP even behind HTTPS.
- **Evidence**: `src/lib/auth-client.ts:5-7`.
- **Recommendation**: Default to a relative path (`baseURL: ''`) or derive from `window.location.origin` on the client instead of pinning to localhost.

## 8. Usage totals are hard-coded and drift from Flowglad’s catalog
- **Impact**: The progress bars rely on `PLAN_USAGE_TOTALS` rather than the actual Flowglad pricing model. Any change to `pricing.yaml` (which already defines the allowance grants in the `usage_credit_grant` entries at the top of the file) silently desynchronizes the UI from billing truth.
- **Evidence**: `src/lib/plan-totals.ts:1-47` duplicates allowances even though `pricing.yaml:1-120` already carries the authoritative amounts, and `home-client.tsx:105-129` consumes those hard-coded numbers.
- **Recommendation**: Parse the allocations from `billing.catalog` (or directly from the pricing model) so progress bars always reflect the live Flowglad plan rather than a second, manual source of truth.

## 9. Database pool is recreated every time the module reloads
- **Impact**: `src/server/db/client.ts:1-13` instantiates a new `pg.Pool` on every import with no `globalThis` guard. During Next.js dev hot reloads (and on serverless platforms with frequent cold starts) this quickly exhausts the Postgres connection limit.
- **Recommendation**: Follow the standard Next.js pattern (`const globalForDb = globalThis as { pool?: Pool }`) so only one Pool exists per process.

## 10. Linting fails out of the box
- **Impact**: `bunx --bun eslint . --ext .ts,.tsx` fails because `test-db-connection.js` uses CommonJS `require`, violating the repo’s lint rules, so CI linting cannot pass.
- **Evidence**: `test-db-connection.js:1-2` uses `require`, and ESLint reports “A require() style import is forbidden”.
- **Recommendation**: Convert the helper script to ESM (`import { Pool } from 'pg'`) or exclude the file from the JS/TS lint config so lint/test/pipeline commands succeed.
