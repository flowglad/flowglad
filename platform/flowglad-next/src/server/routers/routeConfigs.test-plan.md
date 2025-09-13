# Route Configs Unit Test Plan

This document outlines the comprehensive test plan for all router route configs in the Flowglad platform. Each router's route configuration needs unit test coverage to ensure proper mapping of REST endpoints to TRPC procedures.

## Overview

Based on analysis of the `platform/flowglad-next/src/server` directory, we've identified **19 routers** with route configs that require unit test coverage. The tests should focus on:

1. **Route pattern matching** - Verify REST paths map to correct TRPC procedures
2. **RegExp pattern validation** - Ensure patterns match intended paths and reject invalid ones
3. **mapParams function behavior** - Validate parameter extraction and payload mapping
4. **Route configuration completeness** - Check all expected routes exist with proper structure

## Test Structure Template

Each router test should follow this structure (based on successful `customersRouter.routeConfigs.test.ts`):

```typescript
describe('[RouterName]RouteConfigs', () => {
  describe('Route pattern matching and procedure mapping', () => {
    // Test each route maps to correct TRPC procedure
  })
  
  describe('Route pattern RegExp validation', () => {
    // Test patterns match expected paths and reject invalid ones
    // Test URL parameter extraction from regex capture groups
  })
  
  describe('mapParams function behavior', () => {
    // Test parameter mapping for each route type
    // Test body handling and URL parameter extraction
  })
  
  describe('Route config completeness', () => {
    // Verify all expected routes exist
    // Ensure consistent parameter usage
    // Validate route config structure
  })
})
```

---

## Router Test Plans

### 1. apiKeysRouteConfigs

**File**: `src/server/routers/apiKeysRouter.routeConfigs.test.ts`

**Route Configs to Test**: 
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify standard CRUD operations (list, create, get, update, delete) map correctly to `apiKeys.*` procedures
- **Pattern Validation**: Test `/api-keys` and `/api-keys/:id` patterns
- **Parameter Mapping**: Ensure `id` parameter extraction works for routes with ID
- **Completeness**: Verify all 5 standard CRUD routes exist

---

### 2. checkoutSessionsRouteConfigs 

**File**: `src/server/routers/checkoutSessionsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `checkoutSessions.*` procedures
- **Pattern Validation**: Test `/checkout-sessions` and `/checkout-sessions/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction for individual resource routes
- **Completeness**: Verify standard CRUD route set exists

---

### 3. discountsRouteConfigs

**File**: `src/server/routers/discountsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
```typescript
{
  ...trpcToRest('discounts.create'),
  ...trpcToRest('discounts.update'), 
  ...trpcToRest('discounts.get'),
  ...trpcToRest('discounts.list'),
}
```

**Test Cases**:
- **Route Mapping**: Verify 4 routes map correctly to discount procedures
- **Pattern Validation**: Test `/discounts` and `/discounts/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction for get/update operations
- **Completeness**: Verify exactly 4 routes exist (create, update, get, list)
- **Missing Routes**: Confirm delete, attempt, clear routes are intentionally omitted

---

### 4. featuresRouteConfigs

**File**: `src/server/routers/featuresRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `features.*` procedures  
- **Pattern Validation**: Test `/features` and `/features/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify all standard CRUD routes exist

---

### 5. invoiceLineItemsRouteConfigs

**File**: `src/server/routers/invoiceLineItemsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `invoiceLineItems.*` procedures
- **Pattern Validation**: Test `/invoice-line-items` and `/invoice-line-items/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 6. invoicesRouteConfigs

**File**: `src/server/routers/invoicesRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `invoices.*` procedures
- **Pattern Validation**: Test `/invoices` and `/invoices/:id` patterns  
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 7. paymentMethodsRouteConfigs

**File**: `src/server/routers/paymentMethodsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `paymentMethods.*` procedures
- **Pattern Validation**: Test `/payment-methods` and `/payment-methods/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 8. paymentsRouteConfigs + refundPaymentRouteConfig

**File**: `src/server/routers/paymentsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
```typescript
// Standard routes
paymentsRouteConfigs = routeConfigs

// Custom route  
refundPaymentRouteConfig = {
  'POST /payments/:id/refund': {
    procedure: 'payments.refund',
    pattern: new RegExp(`^payments\/([^\\/]+)\/refund$`),
    mapParams: (matches) => ({ id: matches[0] }),
  },
}
```

**Test Cases**:
- **Route Mapping**: Test standard CRUD routes + custom refund route
- **Pattern Validation**: Test standard patterns + `/payments/:id/refund` pattern
- **Parameter Mapping**: Test standard `id` extraction + custom refund parameter mapping
- **Completeness**: Verify 5 standard routes + 1 custom refund route
- **Custom Route**: Specifically test refund route maps `payments/123/refund` to `{ id: '123' }`

---

### 9. pricesRouteConfigs

**File**: `src/server/routers/pricesRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `prices.*` procedures
- **Pattern Validation**: Test `/prices` and `/prices/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 10. pricingModelsRouteConfigs + getDefaultPricingModelRouteConfig

**File**: `src/server/routers/pricingModelsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
```typescript
// Standard routes
pricingModelsRouteConfigs = routeConfigs

// Custom route
getDefaultPricingModelRouteConfig = {
  'GET /pricing-models/default': {
    procedure: 'pricingModels.getDefault',
    pattern: new RegExp(`^pricing-models\/default$`),
    mapParams: (matches) => ({
      externalId: matches[0],
    }),
  },
}
```

**Test Cases**:
- **Route Mapping**: Test standard CRUD routes + custom default route
- **Pattern Validation**: Test standard patterns + `/pricing-models/default` pattern
- **Parameter Mapping**: Test standard `id` extraction + custom default parameter mapping
- **Completeness**: Verify 5 standard routes + 1 custom default route
- **Custom Route**: Test default route maps `pricing-models/default` correctly
- **Bug Alert**: Custom route mapParams seems incorrect - `matches[0]` on pattern with no capture groups

---

### 11. productFeaturesRouteConfigs

**File**: `src/server/routers/productFeaturesRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `productFeatures.*` procedures
- **Pattern Validation**: Test `/product-features` and `/product-features/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 12. productsRouteConfigs

**File**: `src/server/routers/productsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
```typescript
{
  ...trpcToRest('products.list'),
  ...trpcToRest('products.create'),
  ...trpcToRest('products.update'),
  ...trpcToRest('products.get'),
}
```

**Test Cases**:
- **Route Mapping**: Verify 4 routes map correctly to product procedures
- **Pattern Validation**: Test `/products` and `/products/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction for get/update operations
- **Completeness**: Verify exactly 4 routes exist (list, create, update, get)
- **Missing Routes**: Confirm delete route is intentionally omitted

---

### 13. purchasesRouteConfigs

**File**: `src/server/routers/purchasesRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `purchases.*` procedures
- **Pattern Validation**: Test `/purchases` and `/purchases/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 14. subscriptionItemFeaturesRouteConfigs

**File**: `src/server/routers/subscriptionItemFeaturesRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Complex nested route structure with custom patterns

**Test Cases**:
- **Route Mapping**: Verify routes map to `subscriptionItemFeatures.*` procedures
- **Pattern Validation**: Test nested resource patterns (likely involves subscription item IDs)
- **Parameter Mapping**: Test extraction of multiple path parameters
- **Completeness**: Verify all expected nested routes exist
- **Complex Patterns**: Handle multi-level resource nesting

---

### 15. subscriptionsRouteConfigs

**File**: `src/server/routers/subscriptionsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
```typescript
[
  ...routeConfigs, // Standard CRUD
  trpcToRest('subscriptions.adjust', {
    routeParams: ['id'],
  }),
  trpcToRest('subscriptions.cancel', {
    routeParams: ['id'],
  }),
]
```

**Test Cases**:
- **Route Mapping**: Test standard CRUD routes + custom adjust/cancel routes
- **Pattern Validation**: Test standard patterns + `/subscriptions/:id/adjust` and `/subscriptions/:id/cancel` patterns
- **Parameter Mapping**: Test `id` parameter extraction for all routes
- **Completeness**: Verify 5 standard routes + 2 custom action routes
- **Custom Actions**: Test adjust and cancel routes map parameters correctly
- **Array Structure**: Handle array-based route config structure

---

### 16. usageEventsRouteConfigs

**File**: `src/server/routers/usageEventsRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `usageEvents.*` procedures
- **Pattern Validation**: Test `/usage-events` and `/usage-events/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 17. usageMetersRouteConfigs

**File**: `src/server/routers/usageMetersRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `usageMeters.*` procedures
- **Pattern Validation**: Test `/usage-meters` and `/usage-meters/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

### 18. webhooksRouteConfigs

**File**: `src/server/routers/webhooksRouter.routeConfigs.test.ts`

**Route Configs to Test**:
- Standard CRUD operations from `generateOpenApiMetas`

**Test Cases**:
- **Route Mapping**: Verify CRUD operations map to `webhooks.*` procedures
- **Pattern Validation**: Test `/webhooks` and `/webhooks/:id` patterns
- **Parameter Mapping**: Test `id` parameter extraction
- **Completeness**: Verify standard CRUD routes exist

---

## Implementation Priority

### High Priority (Complex/Custom Routes)
1. **paymentsRouter** - Has custom refund route
2. **pricingModelsRouter** - Has custom default route with potential bug
3. **subscriptionsRouter** - Has multiple custom action routes + array structure
4. **customersRouter** - ✅ Already completed
5. **subscriptionItemFeaturesRouter** - Complex nested structure

### Medium Priority (Standard CRUD with Variations)
6. **discountsRouter** - Missing some standard routes
7. **productsRouter** - Missing delete route

### Low Priority (Standard CRUD)
8. **apiKeysRouter**
9. **checkoutSessionsRouter** 
10. **featuresRouter**
11. **invoiceLineItemsRouter**
12. **invoicesRouter**
13. **paymentMethodsRouter**
14. **pricesRouter**
15. **productFeaturesRouter**
16. **purchasesRouter**
17. **usageEventsRouter**
18. **usageMetersRouter**
19. **webhooksRouter**

---

## Common Test Patterns

All tests should verify:

1. **Route Existence**: Each expected route key exists in the config object
2. **Procedure Mapping**: Route maps to correct TRPC procedure name
3. **Pattern Matching**: RegExp correctly matches intended paths
4. **Pattern Rejection**: RegExp rejects invalid/unintended paths
5. **Parameter Extraction**: URL parameters extracted to correct payload keys
6. **Body Handling**: Request bodies passed through or merged correctly
7. **Edge Cases**: Special characters, encoded values, empty parameters

## Testing Strategy Notes

- **No Database Dependencies**: These tests focus on route configuration logic only
- **Mock-Free**: Use real route config objects, no mocking needed  
- **Comprehensive Coverage**: Test all routes, patterns, and parameter mappings
- **Regression Prevention**: Catch configuration changes that break API contracts
- **Performance**: Fast unit tests that can run frequently

---

## Expected Outcome

After implementing all tests, we'll have:
- **~19 test files** covering all router route configs
- **~300+ test cases** ensuring comprehensive coverage
- **Automated validation** of REST-to-TRPC mapping integrity
- **Documentation** of expected API endpoint behavior
- **Regression protection** for route configuration changes