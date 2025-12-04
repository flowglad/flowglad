# ⚠️ DEPRECATED: @flowglad/types

> **This package is deprecated and will no longer receive updates.**
>
> All type definitions have been migrated to **[@flowglad/shared](https://www.npmjs.com/package/@flowglad/shared)**.

## Migration Guide

Please update your imports from `@flowglad/types` to `@flowglad/shared`:

### Before
```typescript
import { 
  CreateProductCheckoutSessionParams,
  Price,
  Product,
  Subscription,
  Customer
} from '@flowglad/types'
```

### After
```typescript
import { 
  CreateProductCheckoutSessionParams,
  Price,
  Product,
  Subscription,
  Customer
} from '@flowglad/shared'
```

## Why was this deprecated?

To improve maintainability and reduce package fragmentation, we've consolidated all type definitions into the `@flowglad/shared` package. This provides:

- **Single source of truth** for all Flowglad types
- **Better organization** with types in a dedicated subfolder
- **Simplified dependency management** across SDK packages
- **Reduced bundle sizes** by eliminating duplicate type definitions

## Timeline

- **Last stable version**: 0.13.0
- **Deprecation date**: December 2025
- **Support status**: No further updates planned

## Need Help?

If you encounter any issues during migration:
- Check the [@flowglad/shared documentation](https://github.com/flowglad/flowglad/tree/main/packages/shared)
- Open an issue on [GitHub](https://github.com/flowglad/flowglad/issues)
- Join our [Discord community](https://discord.com/servers/flowglad-1273695198639161364)

