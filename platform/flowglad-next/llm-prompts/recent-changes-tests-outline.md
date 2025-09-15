# Test Plan Outline: Pricing Model Creation and Price Creation

## Scope
- Server procedures affected: `pricingModelsRouter.create`, `pricesRouter.create`.
- Utilities: `createPricingModelBookkeeping` for default product and price creation.

## pricingModelsRouter.create
- Happy path: creates pricing model, default product, and default price of 0.
  - Setup: org + api key; input with `pricingModel.name`, optional `isDefault`, optional `defaultPlanIntervalUnit`.
  - Expect: pricing model persisted; default product exists with `default: true`; default price exists with `unitPrice=0` and type based on `defaultPlanIntervalUnit`.
- Optional interval unit provided (renewing plan):
  - Setup: `defaultPlanIntervalUnit=Month`.
  - Expect: default price `type=Subscription`, `intervalUnit=Month`, `intervalCount=1`.
- No interval unit (non-renewing):
  - Setup: `defaultPlanIntervalUnit` omitted.
  - Expect: default price `type=SinglePayment`, `intervalUnit=null`, `intervalCount=null`.
- isDefault=true behavior:
  - Setup: org with existing default pricing model; try to create another with `isDefault=true`.
  - Expect: either the new one becomes default and previous unset or constraint/guard as per `safelyInsertPricingModel` conventions. Verify current default semantics.

## pricesRouter.create
- First price for a product auto-default:
  - Setup: product without prices.
  - Input: non-default price payload with `isDefault=false`.
  - Expect: created price has `isDefault=true` (auto-default) and currency from org.
- Enforce single default per product:
  - Setup: product with existing default price.
  - Input: second price with `isDefault=true`.
  - Expect: BAD_REQUEST error "There must be exactly one default price per product".
- Allow additional prices on default product (new behavior):
  - Setup: default product with existing default price.
  - Input: create non-default additional price.
  - Expect: succeeds; new price `isDefault=false`.
- Currency and livemode propagation:
  - Setup: org default currency not USD; ctx.livemode true/false.
  - Expect: created price `currency=org.defaultCurrency`, `livemode=ctx.livemode`.

## Cross-router guards
- productsRouter.edit cross-product price guard remains enforced (regression check).
  - Setup: two products; attempt to attach price from other product.
  - Expect: TRPCError BAD_REQUEST.

## RLS/auth integration
- All mutations require valid apiKey and respect org/livemode scoping.
  - Setup: create api key; use as ctx for router callers.
  - Expect: created records belong to ctx.organizationId and ctx.livemode.

# Recent Changes Test Plan

This document outlines scenarios to test for recent changes across the prices router and the `PricingModelFormFields` component.

## Prices Router (`src/server/routers/pricesRouter.ts`)

1. createPrice: forbid additional prices for default products
   - Setup: org with default pricing model, default product, default price
   - Action: call `pricesRouter.create` to create a second price on the default product
   - Expect: TRPCError FORBIDDEN with message "Cannot create additional prices for the default plan"

2. createPrice: auto-default for first price on a default product
   - Setup: org with default product but no prices yet
   - Action: call `pricesRouter.create` for the default product with `isDefault: false`
   - Expect: created price has `isDefault: true`

3. createPrice: enforce single default per product (regular product)
   - Setup: product with existing default price
   - Action: call `pricesRouter.create` with another `isDefault: true` price on same product
   - Expect: TRPCError BAD_REQUEST (single default per product)

4. editPrice: disallow slug change for default price of a default product
   - Setup: default product with its default price
   - Action: call `pricesRouter.edit` changing `slug`
   - Expect: TRPCError FORBIDDEN with message about slug change

5. listUsagePricesForProduct: returns only active usage prices
   - Setup: product with prices: (usage+active), (usage+inactive), (subscription)
   - Action: call `pricesRouter.listUsagePricesForProduct` with productId
   - Expect: only the active usage price returned

## Component: `PricingModelFormFields`

1. Render (create mode): default behavior section visible
   - Setup: render with `edit=false` and no `defaultPlanIntervalUnit`
   - Expect: shows "Default Plan Behavior"; interval select hidden

2. Choose Renewing: sets default interval and shows select
   - Action: click Renewing card
   - Expect: `defaultPlanIntervalUnit` becomes Month; interval select shows "Month"

3. Choose Non-renewing: clears interval and hides select
   - Action: click Non-renewing card
   - Expect: `defaultPlanIntervalUnit` cleared; interval select hidden

4. Keyboard activation: Enter/Space triggers cards
   - Action: focus Renewing/Non-renewing and press Enter/Space
   - Expect: same state changes as clicks

5. Default switch only in create mode
   - Setup: render with `edit=false` vs `edit=true`
   - Expect: switch visible in create, hidden in edit

6. Name field binds to `pricingModel.name`
   - Action: type into Name input
   - Expect: value reflected in input


