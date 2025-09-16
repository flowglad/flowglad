# Registry Component Type Drift Analysis

## Goals

The registry components in `platform/flowglad-next/src/registry` are intended to serve as the foundation for a framework of billing UI components that integrate seamlessly with Flowglad. The key design goals are:

1. **Independence**: Registry components should have no dependencies on the rest of the flowglad-next codebase
2. **Alignment**: Registry prop types should closely map to Flowglad's billing concepts
3. **Maintainability**: Minimal transformation logic should be needed when using registry components
4. **Reusability**: Components should be easily extractable for use in other Flowglad-integrated applications

Reducing drift between registry props and flowglad-next internal props is critical because:
- It reduces the maintenance burden of transformation logic
- It prevents runtime errors from manual type mappings
- It makes the registry truly portable and framework-agnostic
- It provides a clearer contract for what billing data structures Flowglad expects

## Current State Analysis

### 1. Subscription Type Mapping Issues

**Major Drift:** The backend returns a discriminated union (`richSubscriptionClientSelectSchema`) with `renews: true/false` variants, but the registry expects a flat `Subscription` interface.

**Evidence:** In `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/Internal.tsx:179-185`, we see conditional logic to extract fields based on the `renews` property:

```typescript
if (currentSubscription?.renews) {
    currentPeriodEnd = currentSubscription.currentBillingPeriodEnd
    currentPeriodStart = currentSubscription.currentBillingPeriodStart
    cancelAtPeriodEnd = Boolean(currentSubscription.cancelScheduledAt)
    canceledAt = currentSubscription.canceledAt
    trialEnd = currentSubscription.trialEnd
}
```

**Registry Expectation:** The registry expects flat properties like `currentPeriodEnd`, `currentPeriodStart`, `cancelAtPeriodEnd` directly on the subscription object.

**Impact:** This forces manual field extraction and type casting, making the code prone to runtime errors and harder to maintain.

### 2. Currency Handling Inconsistency

**Major Drift:** Currency is handled inconsistently across components.

**Current Implementation:**
- Subscription items each have their own `currency` field in the mapping (`Internal.tsx:233`)
- The registry `SubscriptionItem` type expects currency at the item level
- Invoices have currency at the root level
- The actual backend subscription doesn't provide currency at the subscription level

**Impact:** This creates redundancy and potential inconsistencies, as subscriptions typically have a single currency for all items.

### 3. Payment Method Type Narrowing

**Complexity:** The payment method mapping in `Internal.tsx:258-275` shows significant manual transformation:

```typescript
paymentMethods={data.paymentMethods.map((pm) => {
  const paymentData = pm.paymentMethodData || {}
  return {
    id: pm.id,
    type: 'card' as const,
    last4: String(paymentData.last4 || '****'),
    brand: String(paymentData.brand || 'unknown'),
    expiryMonth: typeof paymentData.exp_month === 'number' ? paymentData.exp_month : undefined,
    expiryYear: typeof paymentData.exp_year === 'number' ? paymentData.exp_year : undefined,
    isDefault: pm.default || false,
  }
})}
```

**Issues:**
- Backend returns `paymentMethodData` as generic JSON with various fields
- Registry expects a typed discriminated union with specific fields per payment type
- Current implementation forces everything to `type: 'card'` and casts fields with fallbacks

### 4. Invoice Status and Amount Mismatch

**Missing Fields:** Invoice mapping in `Internal.tsx:293-305` reveals several issues:

```typescript
invoices={data.invoices.map((inv) => {
  const invoice = inv.invoice
  return {
    id: invoice.id,
    number: invoice.invoiceNumber,
    status: invoice.status,
    created: invoice.createdAt,
    dueDate: new Date(invoice.dueDate),
    amountDue: 0,  // Hardcoded!
    currency: invoice.currency,
    hostedInvoiceUrl: invoice.pdfURL || undefined,
  }
})}
```

**Problems:**
- `amountDue` is hardcoded to `0` - backend doesn't provide this directly
- Missing `amountPaid` field
- Invoice line items aren't properly mapped to registry expectations
- Status is passed through without validation against registry's `InvoiceStatus` type

### 5. Subscription Item Structure Mismatch

**Deep Nesting Issues:** In `Internal.tsx:227-237`:

```typescript
items: currentSubscription.subscriptionItems.map((item) => ({
  id: item.id,
  productName: item.name || '',
  quantity: item.quantity,
  unitAmount: item.unitPrice,
  currency: 'usd',
  priceId: item.priceId || '',
  productId: '',
}))
```

**Problems:**
- Backend returns `subscriptionItems` with nested `price` object containing product details
- Registry expects flattened structure with `productName`, `priceId`, `productId` at item level
- Current solution uses manual extraction and empty string fallbacks

### 6. Missing Type Safety for Optional Fields

**Date Handling:** Multiple places show unsafe date conversions:

```typescript
canceledAt: canceledAt ? new Date(canceledAt) : undefined,
trialEnd: trialEnd ? new Date(trialEnd) : undefined,
dueDate: new Date(invoice.dueDate),  // No null check!
```

These conversions lack proper null checking and could throw runtime errors.

## Areas of Greatest Drift

1. **Subscription Structure**: The discriminated union vs. flat interface mismatch requires the most complex transformation logic
2. **Payment Method Types**: The generic JSON structure vs. typed discriminated union creates type safety issues
3. **Financial Calculations**: Missing computed fields (like `amountDue`) require either backend changes or client-side calculation
4. **Date Handling**: Inconsistent date formats and missing null checks create runtime risks

## Potential Improvements

### Immediate Improvements

**Hoist Common Properties:** Moving properties like `currency` to the parent component level (e.g., `SubscriptionCard`) would eliminate redundancy and better match typical billing structures where a subscription has one currency.

**Create Adapter Layer:** Implementing type-safe mapping functions in a dedicated adapter layer would centralize transformation logic and improve maintainability.

### Structural Improvements

**Align Subscription Types:** Either update the registry to handle the discriminated union pattern or create a normalized subscription type that the backend can consistently map to.

**Fix Payment Method Types:** Extend the registry's `PaymentMethod` union to better handle the backend's actual data structure, potentially adding a generic `paymentMethodData` field for flexibility.

**Invoice Amount Calculations:** Either ensure the backend provides all required financial fields or add support for computed fields in the registry types.

**Type Guards and Validation:** Add runtime validation using zod schemas in the registry and create type guard functions for safe conversions.

## Conclusion

The current implementation functions but requires significant manual mapping that introduces maintenance burden and potential runtime errors. The drift between registry component expectations and backend data structures undermines the registry's goal of being a clean, independent billing UI framework. Addressing these misalignments would improve code maintainability, type safety, and the registry's reusability across different Flowglad integrations.