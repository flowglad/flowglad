---
"@flowglad/nextjs": patch
"@flowglad/server": patch
"@flowglad/shared": patch
"@flowglad/react": patch
---

### Upgrade to @flowglad/node 0.29.0

- [f3249ae8](https://github.com/flowglad/flowglad/commit/f3249ae8): Bump @flowglad/node from 0.28.0 to 0.29.0 across all packages
  - Adds proper typing for `UsageMeter.prices` field in the SDK
  - Removes the need for type cast workarounds when accessing usage meter prices

### Catalog → PricingModel Migration

- [275550da](https://github.com/flowglad/flowglad/commit/275550da): Rename `catalog` to `pricingModel` in shared utilities
  - `constructGetProduct`, `constructGetPrice`, and `constructHasPurchased` now accept `pricingModel` parameter
  - Type safety improvements by removing `UsageMeterWithPrices` cast workaround

- [17792466](https://github.com/flowglad/flowglad/commit/17792466): Replace `catalog` with `pricingModel` across packages
  - `@flowglad/react`: `useCatalog` hook renamed to `usePricingModel`
  - `@flowglad/server`: Updated `FlowgladServer` to use `pricingModel` internally
  - `@flowglad/shared`: Renamed `types/catalog.ts` to `types/pricingModel.ts`, `Catalog` type renamed to `PricingModel`
  - Documentation updated to reflect new naming

- [ddaa0fca](https://github.com/flowglad/flowglad/commit/ddaa0fca): Add deprecated aliases for backward compatibility
  - `Catalog` type alias (deprecated, use `PricingModel`)
  - `useCatalog` hook (deprecated, use `usePricingModel`)
  - `catalog` property remains available in billing context (deprecated, use `pricingModel`)

## Migration Guide

### Hook Migration

**Before:**
```typescript
import { useCatalog } from '@flowglad/react'
const catalog = useCatalog()
```

**After:**
```typescript
import { usePricingModel } from '@flowglad/react'
const pricingModel = usePricingModel()
```

### Type Migration

**Before:**
```typescript
import type { Catalog } from '@flowglad/shared'
```

**After:**
```typescript
import type { PricingModel } from '@flowglad/shared'
```

## Breaking Changes

⚠️ **None** - All changes include backward-compatible deprecated aliases. The `catalog` property, `useCatalog` hook, and `Catalog` type continue to work but are marked as deprecated. Users are encouraged to migrate to the new `pricingModel` naming.
