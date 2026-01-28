## Prompt: Integrate Flowglad Billing Into a {FRAMEWORK} App

You are an expert {LANGUAGE}/{FRAMEWORK} engineer and Flowglad integrator.  

You are given a **startup-style {FRAMEWORK} project** that currently has **no real billing or payment processing** wired up (at most: mock pricing data, placeholder billing hooks, or hard-coded plans).

Your task is to **integrate Flowglad end‑to‑end** so that:

- Authenticated users have Flowglad customers.
- Plans and usage meters are driven by a Flowglad pricing model.
- Usage events are recorded via Flowglad.
- The features that customers can access are determined by reading from Flowglad what features a given customer has access to
- The UI (pricing page, dashboard, navbar) reflects real subscription and usage state.

Assume:

- The project uses **{FRAMEWORK}** ({FRAMEWORK_ROUTING_INFO}).
- Authentication is handled with **{AUTH_LIBRARY}** ({AUTH_FILE_PATHS}) or a comparable session‑based system you can access from both server and client.
- The project may already have:
  - A pricing page.
  - A dashboard or home page.
  - Mock billing utilities (e.g. `{MOCK_BILLING_PATH}`).

Your output should be **code changes only** (no commentary).

---

### 1. High-Level Objectives

- **Introduce Flowglad billing** into an otherwise billing‑agnostic {FRAMEWORK} app.
- **Wire Flowglad server-side** so it:
  - Authenticates the current user via your existing auth system ({AUTH_LIBRARY} in this repo).
  - Resolves the Flowglad customer from the authenticated user ({CUSTOMER_ID_SOURCE}).
  - When a customer is created in our app (user registration if B2C, organization/team if B2B), we create a Flowglad customer record based on the id we use for that customer in our app.
  - Exposes a Flowglad HTTP API surface via `/api/flowglad/[...path]` (or equivalent route pattern).
- **Wire Flowglad client-side** so {FRONTEND_FRAMEWORK} components:
  - Use `useBilling` from `{FLOWGLAD_CLIENT_PACKAGE}` as the canonical billing source of truth.
  - Use `usePricing` from `{FLOWGLAD_CLIENT_PACKAGE}` for public pricing model data (pricing pages, plan cards).
  - Rely on `billing.loaded`, `billing.errors`, `billing.currentSubscriptions`, and helpers like `billing.checkUsageBalance`, `billing.checkFeatureAccess`, `billing.getPrice`, `billing.createCheckoutSession`, `billing.cancelSubscription`, `billing.reload`.
- **Connect a Flowglad pricing model** to:
  - Subscription plans.
  - Usage meters ({USAGE_METER_EXAMPLES}).
  - Feature toggles ({FEATURE_TOGGLE_EXAMPLES}).
  - Usage top-ups.
- **Keep the UI conceptually the same** (pricing page, plan selection, usage meters), but back it with real Flowglad data instead of mocks.

---

### 2. Package & Script Changes (`{PACKAGE_FILE}`)

Update `{PACKAGE_FILE}` to add the Flowglad SDK packages. Prefer using published versions (or local workspace links if you're in a monorepo).

- **Add Flowglad dependencies** under `dependencies`:

{PACKAGE_DEPENDENCIES_CODE}

Note: the Flowglad SDKs are currently for Typescript only. The current latest version is 0.16.2.

Here's what they should install depending on their project:
- Next.js: @flowglad/nextjs
- Express: @flowglad/server (use the /express subpath import)
- React: @flowglad/react (note: if they're using Next.js, DO NOT INSTALL @flowglad/react - just use @flowglad/nextjs as it includes /react as a dependency)
- Any other Typescript backend: @flowglad/server (note: if they're using Next.js, just use @flowglad/nextjs - DO NOT INSTALL @flowglad/server separately as @flowglad/nextjs includes it as a dependency)

If you are integrating Flowglad from a **local monorepo** instead of npm, you may instead use `"file:..."` or workspace references. Adjust the versions/paths accordingly.

{PACKAGE_SCRIPTS_CODE}

Do **not** remove unrelated scripts or dependencies; only add/adjust what's required for Flowglad.

---

### 4. Server-Side Flowglad Wiring (`{FLOWGLAD_SERVER_PATH}`)

Create (or update) `{FLOWGLAD_SERVER_PATH}` in the project to centralize server‑side Flowglad access:

{FLOWGLAD_SERVER_CODE}

Requirements:

- Use the project's existing auth system ({AUTH_LIBRARY}).
- Map your authenticated {CUSTOMER_ENTITY} to Flowglad's `externalId`, `name`, and `email`.
- Throw if no session/auth so Flowglad routes are protected.
- For B2B apps, derive the organization/team ID from the request context.

---

### 5. Flowglad API Route (`{FLOWGLAD_ROUTE_PATH}`)

Expose Flowglad's HTTP API using a {FRAMEWORK} route handler:

{FLOWGLAD_ROUTE_CODE}

Make sure this route follows {FRAMEWORK} conventions for API routes.

---

### 6. {FRONTEND_FRAMEWORK} Provider Setup (`{PROVIDER_COMPONENT_PATH}` + `{ROOT_LAYOUT_PATH}`)

{FRONTEND_PROVIDER_SECTION}

**Note**: If the project is server-only (no React/Vue/Svelte frontend), skip this section. Flowglad can be used server-side only via `flowgladServer.getBilling()` calls.

---

### 7. Replace Local Billing Hook (If Present) With Flowglad `useBilling`

Scan the project for any **local billing hooks** or placeholder billing utilities. Typical examples:

- `{MOCK_BILLING_PATH}` exporting `useBilling` and maybe helpers like `decrementUsageBalance`.
- Components importing `useBilling` from an internal path such as `{MOCK_BILLING_IMPORT_PATH}`.

Replace those imports with Flowglad's `useBilling` hook:

```{LANGUAGE_EXTENSION}
// before (template)
import { useBilling } from '{MOCK_BILLING_IMPORT_PATH}';

// after (Flowglad)
import { useBilling } from '{FLOWGLAD_CLIENT_PACKAGE}';
```

Make the same change everywhere the old hook was used (pricing components, navbars, dashboards, etc.).

Then, **delete** the obsolete local billing implementation file(s) that only exist to support mock/local billing.

Preserve all **call sites** and their semantics. Flowglad's `useBilling` is intentionally shaped to make this mostly a drop‑in replacement:

- `billing.loaded`
- `billing.errors`
- `billing.pricingModel`
- `billing.currentSubscriptions`
- `billing.checkUsageBalance(slug)`
- `billing.checkFeatureAccess(slug)`
- `billing.getPrice(slug)`
- `billing.createCheckoutSession(...)`
- `billing.cancelSubscription(...)`
- `billing.reload()`

If any component previously mutated balances locally (e.g. `decrementUsageBalance` against `localStorage`), remove that direct mutation and instead rely on:

- The `/api/usage-events` route (see below) to create usage events.
- A subsequent `billing.reload()` to refresh balances.

---

### 8. Billing Helper {TYPE_SYSTEM} (`{BILLING_HELPERS_PATH}`)

Introduce or update billing helpers to use Flowglad's shared types.

{BILLING_HELPERS_CODE}

These helpers let your UI easily:

- Discover usage meters and prices by slug.
- Compute total included credits per plan.
- Determine whether a plan is the default/free plan.

---

### 9. Usage Event API (`{USAGE_EVENTS_ROUTE_PATH}`)

If the app tracks usage (e.g. API calls, compute time, storage, {USAGE_EXAMPLES}), introduce or update an API route that records usage via Flowglad instead of a mock store.

- Path: `{USAGE_EVENTS_ROUTE_PATH}`

{USAGE_EVENTS_CODE}

Remove any mock logic that simply echoes back the request or stores usage locally.

---

### 10. UI Components That Consume Billing

Make sure all billing-aware UI components are updated to use Flowglad:

- `{PRICING_COMPONENT_PATH}` (or equivalent pricing UI)
  - Import `usePricing` (and `useBilling` for checkout actions) from `{FLOWGLAD_CLIENT_PACKAGE}`.
  - Use `pricingModel.products` to derive subscription plans (filter out default/free products, build `PricingPlan` objects).
- `{NAVBAR_COMPONENT_PATH}` (or equivalent account menu)
  - Import `useBilling` from `{FLOWGLAD_CLIENT_PACKAGE}`.
  - Use `billing.currentSubscriptions?.[0]` to derive the active subscription.
  - Use `billing.cancelSubscription` to schedule cancellations and show cancellation state.
- `{DASHBOARD_COMPONENT_PATH}` (or equivalent dashboard)
  - Import `useBilling` from `{FLOWGLAD_CLIENT_PACKAGE}`.
  - Use `billing.checkUsageBalance`, `billing.checkFeatureAccess`, `billing.getPrice`, `billing.createCheckoutSession`, and `billing.reload` to:
    - Gate access to primary features by plan.
    - Show remaining vs total usage for each meter.
    - Start checkouts for top‑ups or plan upgrades.
  - Do **not** manually mutate balances; rely on Flowglad usage events + reload.

If the startup repo did not previously have any billing UI, you may create a minimal pricing page and basic usage meters that follow this pattern.

---

### 11. Environment Variables

Ensure the target project has the Flowglad environment variable configured:

- `{ENV_FILE}` should include:

```env
FLOWGLAD_SECRET_KEY=sk_test_or_live_from_flowglad
```

Do **not** hard-code secrets in code; only reference `{ENV_VAR_ACCESS}` where required by Flowglad packages (usually inside the Flowglad SDK configuration, not directly in your app code).

---

### 12. Final Checklist (What You Must Achieve)

When you are done, the project should:

- **Compile and type-check** successfully - verify this by running the project's compilation / lint / typechecking step.
- **Run** with:
  - Working authentication ({AUTH_LIBRARY} or equivalent).
  - Flowglad billing:
    - Pricing page shows plans derived from the Flowglad pricing model (based on the `pricing.yaml` included here).
    - Authenticated users are mapped to Flowglad customers.
    - Usage meters ({USAGE_METER_EXAMPLES}) are driven by Flowglad.
    - Top‑ups and usage events are created through Flowglad, not local mocks.
- Have **no leftover mock billing code**: no `localStorage`-based balances, no hard-coded plan entitlements, no unused billing implementations.

Apply all necessary edits in one pass so that the resulting project is fully Flowglad‑integrated without requiring additional manual fixes.
