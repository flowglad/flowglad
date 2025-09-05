TRPC stale inputs audit and remediation

Context

- Global defaults (see `platform/flowglad-next/src/app/_trpc/Provider.tsx`): queries use refetchOnMount: false and staleTime: 5m. Any query not overriding this can appear stale immediately after user-driven create/update actions.
- We previously observed: (1) creating/updating customers didn’t appear in Create Invoice modal, (2) creating/updating features didn’t appear in Create Product modal. The root cause was queries not forcing a fresh fetch on open. We fixed those specific cases by setting refetchOnMount: 'always' and staleTime: 0.
- Preferred strategy: Favor simple, idiomatic `refetchOnMount: 'always'` (with `staleTime: 0`) when applicable. Only use `.invalidate()` where it is already present or clearly the better fit for that flow. If a flow already uses `.invalidate()` effectively, leave it as-is.

Complete list of modals, dropdowns, and tables at risk of stale data

Description: Features selector in Create/Edit Product (multi-select tied to pricing model)
File: `platform/flowglad-next/src/components/forms/ProductFeatureMultiSelect.tsx`
Lines: 14-23 (TRPC query with refetchOnMount: 'always', staleTime: 0), 41-63 (render options)

Description: Pricing model selector in Create Product
File: `platform/flowglad-next/src/components/forms/PricingModelSelect.tsx`
Lines: 30-37 (useListPricingModelsQuery and getDefault query), 49-83 (Select rendering)
Hook: `platform/flowglad-next/src/app/hooks/useListPricingModelsQuery.ts` lines 5-15 (no refetchOnMount override)

Description: Usage meter selector in Usage prices
File: `platform/flowglad-next/src/components/forms/UsageMetersSelect.tsx`
Lines: 29-44 (useListUsageMetersQuery, auto-select on load), 47-83 (Select rendering)
Hook: `platform/flowglad-next/src/app/hooks/useListUsageMetersQuery.ts` lines 3-5 (no refetchOnMount override)

Description: Overage price selector for Recurring Usage Credits
File: `platform/flowglad-next/src/components/forms/OveragePriceSelect.tsx`
Lines: 39-43 (prices.listUsagePricesForProduct query), 46-55 (auto-select), 66-80 (render options)

Description: Customers dropdown in Create/Edit Invoice
File: `platform/flowglad-next/src/components/forms/InvoiceFormFields.tsx`
Lines: 61-75 (customers.list useQuery with refetchOnMount: 'always', staleTime: 0), 141-173 (Select rendering)

Description: Owners dropdown in Create/Edit Invoice (organization members)
File: `platform/flowglad-next/src/components/forms/InvoiceFormFields.tsx`
Lines: 77-82 (organizations.getMembers useQuery enabled: false for manual refetch), 221-246 (ConnectedSelect driven by refetch())

Description: Edit Invoice modal (loads customer reference)
File: `platform/flowglad-next/src/components/forms/EditInvoiceModal.tsx`
Lines: 28-33 (customers.internal__getById useQuery), 36-46 (modal composition)

Description: Create Invoice modal
File: `platform/flowglad-next/src/components/forms/CreateInvoiceModal.tsx`
Lines: 60-62 (invoices.create mutation), 70-81 (modal composition)

Description: Create Product modal
File: `platform/flowglad-next/src/components/forms/CreateProductModal.tsx`
Lines: 52-54 (products.create mutation), 71-93 (modal composition)

Description: Edit Product modal (preloads product features/prices)
File: `platform/flowglad-next/src/components/forms/EditProductModal.tsx`
Lines: 23 (products.edit mutation), 28-43 (productFeatures.list useQuery), 45-55 (prices.list useQuery), 63-83 (modal composition)

Description: Create Feature modal
File: `platform/flowglad-next/src/components/forms/CreateFeatureModal.tsx`
Lines: 24 (features.create mutation), 27-51 (modal composition)

Description: Edit Feature modal
File: `platform/flowglad-next/src/components/forms/EditFeatureModal.tsx`
Lines: 23 (features.update mutation), 31-44 (modal composition)

Description: Create Pricing Model modal
File: `platform/flowglad-next/src/components/forms/CreatePricingModelModal.tsx`
Lines: 16 (pricingModels.create mutation), 18-27 (modal composition)

Description: Edit Pricing Model modal
File: `platform/flowglad-next/src/components/forms/EditPricingModelModal.tsx`
Lines: 22 (pricingModels.update mutation), 24-34 (modal composition)

Description: Set Pricing Model as Default modal
File: `platform/flowglad-next/src/components/forms/SetPricingModelAsDefaultModal.tsx`
Lines: 37-52 (pricingModels.update mutateAsync; router.refresh())

Description: Create Price modal
File: `platform/flowglad-next/src/components/forms/CreatePriceModal.tsx`
Lines: 20 (prices.create mutation), 23-41 (modal composition)

Description: Edit Price modal
File: `platform/flowglad-next/src/components/forms/EditPriceModal.tsx`
Lines: 23 (prices.edit mutation), 30-40 (modal composition)

Description: Set Price as Default modal
File: `platform/flowglad-next/src/components/forms/SetPriceAsDefaultModal.tsx`
Lines: 45-59 (prices.edit mutateAsync; router.refresh())

Description: Archive/Unarchive Product modal
File: `platform/flowglad-next/src/components/forms/ArchiveProductModal.tsx`
Lines: 29 (products.edit mutation), 31-49 (mutateAsync; router.refresh())

Description: Archive/Unarchive Price modal
File: `platform/flowglad-next/src/components/forms/ArchivePriceModal.tsx`
Lines: 44 (prices.edit mutation), 46-57 (mutateAsync; router.refresh())

Description: Create Customer modal
File: `platform/flowglad-next/src/components/forms/CreateCustomerFormModal.tsx`
Lines: 18 (customers.create mutation), 28-41 (modal composition)

Description: Edit Customer modal
File: `platform/flowglad-next/src/components/forms/EditCustomerModal.tsx`
Lines: 20 (customers.edit mutation), 23-40 (modal composition)

Description: Invite User to Organization modal (already invalidates)
File: `platform/flowglad-next/src/components/forms/InviteUserToOrganizationModal.tsx`
Lines: 14-18 (inviteUser mutation + trpc.useContext), 29-31 (onSuccess invalidates organizations.getMembers)

Description: Webhook Secret modal (shows secret via query)
File: `platform/flowglad-next/src/app/settings/webhooks/WebhookSecretModal.tsx`
Lines: 17-19 (Modal usage; no TRPC inside modal)

Description: Webhooks table – show secret/edit webhook
File: `platform/flowglad-next/src/app/settings/webhooks/WebhooksTable.tsx`
Lines: 28-35 (requestSigningSecret query disabled, refetch on demand), 56-66 (modals open)

Description: Create API Key modal (already invalidates api keys list)
File: `platform/flowglad-next/src/components/forms/CreateApiKeyModal.tsx`
Lines: 21 (apiKeys.create mutation), 51-53 (onSuccess invalidate apiKeys.get)

Description: Cancel Subscription modal
File: `platform/flowglad-next/src/components/forms/CancelSubscriptionModal.tsx`
Lines: 20-31 (subscriptions.cancel mutation), 42-53 (modal composition)

Description: End Purchase modal
File: `platform/flowglad-next/src/components/forms/EndPurchaseModal.tsx`
Lines: 34-36 (purchases.update mutation), 55-… (modal composition)

Tables likely to show stale lists after create/update (default cache rules)

- Products table — `platform/flowglad-next/src/app/store/products/ProductsTable.tsx` lines 126-132
- Features table — `platform/flowglad-next/src/app/features/FeaturesTable.tsx` lines 67-72
- Pricing models table — `platform/flowglad-next/src/app/store/pricing-models/PricingModelsTable.tsx` lines 87-91
- Prices table — `platform/flowglad-next/src/app/store/products/[id]/PricesTable.tsx` lines 172-186
- Customers table — `platform/flowglad-next/src/app/customers/CustomersTable.tsx` lines 126-135
- Invoices table — `platform/flowglad-next/src/components/InvoicesTable.tsx` lines 136-151
- Payments table — `platform/flowglad-next/src/app/finance/payments/PaymentsTable.tsx` lines 94-101
- Subscriptions table — `platform/flowglad-next/src/app/finance/subscriptions/SubscriptionsTable.tsx` lines 88-95
- Discounts table — `platform/flowglad-next/src/app/store/discounts/DiscountsTable.tsx` lines 116-123
- Usage meters table — `platform/flowglad-next/src/app/store/usage-meters/UsageMetersTable.tsx` lines 32-43
- Organization members table — `platform/flowglad-next/src/app/settings/teammates/OrganizationMembersTable.tsx` lines 41-42

Recommendations and implementation guide

Core approach (prefer refetchOnMount)

1) For dropdowns/multi-selects and modal-local data fetches, add `refetchOnMount: 'always'` with `staleTime: 0` on the relevant `useQuery` call (or the hook wrapping it). This keeps data fresh upon opening.
2) For tables shown on the same page as a mutation-triggering modal, prefer a clean remount (e.g., `router.refresh()` after success) so queries naturally refetch. If a flow already uses `router.refresh()`, no change is needed. If remounting is not desirable, consider passing per-query options through `usePaginatedTableState` to opt specific tables into `refetchOnMount: 'always'` and `staleTime: 0`.
3) Keep existing `.invalidate()` usage where already implemented and working (e.g., members and API keys). Do not add new invalidations unless clearly better than the above.

Refetch-on-open additions (actionable updates)

- Pricing models
  - Update `platform/flowglad-next/src/app/hooks/useListPricingModelsQuery.ts` to pass `{ refetchOnMount: 'always', staleTime: 0 }` as the second argument to `useQuery`.
- Usage meters
  - Update `platform/flowglad-next/src/app/hooks/useListUsageMetersQuery.ts` to pass `{ refetchOnMount: 'always', staleTime: 0 }`.
- Overage prices
  - Update `platform/flowglad-next/src/components/forms/OveragePriceSelect.tsx` to pass `{ refetchOnMount: 'always', staleTime: 0 }` to `trpc.prices.listUsagePricesForProduct.useQuery`.

Tables: when to change vs leave alone

- Leave as-is (no change needed)
  - Flows that call `router.refresh()` on success already remount the page and refetch queries:
    - `SetPricingModelAsDefaultModal` — `platform/flowglad-next/src/components/forms/SetPricingModelAsDefaultModal.tsx` lines 49-52
    - `ArchiveProductModal` — `platform/flowglad-next/src/components/forms/ArchiveProductModal.tsx` lines 46-49
    - `ArchivePriceModal` — `platform/flowglad-next/src/components/forms/ArchivePriceModal.tsx` lines 54-57
    - `SetPriceAsDefaultModal` — `platform/flowglad-next/src/components/forms/SetPriceAsDefaultModal.tsx` lines 56-59
  - Components that already manually refetch or fetch on demand:
    - Owners dropdown (`ConnectedSelect` with `refetch`) — `InvoiceFormFields.tsx` lines 221-246
    - Webhook secret retrieval uses a disabled query and calls `refetch()` on demand — `WebhooksTable.tsx` lines 28-39
  - Existing invalidations that are appropriate; keep them:
    - Invite User modal invalidates members — `InviteUserToOrganizationModal.tsx` lines 29-31
    - Create API Key modal invalidates api keys — `CreateApiKeyModal.tsx` lines 51-53

- Update recommended (choose one of the following per page):
  - If the modal affects the table on the same page (e.g., create/edit feature, price, product, customer, discount, usage meter) and does not `router.refresh()` or already invalidate, prefer adding `router.refresh()` on success to remount and refetch.
  - Alternatively (if avoiding route refresh), enhance `usePaginatedTableState` to accept optional `queryOptions` and pass `{ refetchOnMount: 'always', staleTime: 0 }` at the call sites for tables that are frequently edited via co-located modals.

Code pattern for refetch-on-open

```ts
// Query used by a dropdown or modal-local data
trpc.some.list.useQuery(params, {
  refetchOnMount: 'always',
  staleTime: 0,
})
```

Minimal change guidance by surface (prefer refetch/refresh)

- PricingModelSelect: add refetchOnMount/staleTime in `useListPricingModelsQuery`.
- UsageMetersSelect: add refetchOnMount/staleTime in `useListUsageMetersQuery`.
- OveragePriceSelect: add refetchOnMount/staleTime on `listUsagePricesForProduct` query.
- Features/Customers dropdowns: already handled (no change needed).
- Tables co-located with mutation modals: add `router.refresh()` in modal success handlers (preferred), or pass per-table query options via `usePaginatedTableState` (secondary).

Notes

- Because Provider disables refetchOnMount and sets a long staleTime, selectors and inputs that must be hot-fresh should explicitly opt into `refetchOnMount: 'always'` and `staleTime: 0`.
- Where `.invalidate()` exists and works (members, api keys), keep as-is.


