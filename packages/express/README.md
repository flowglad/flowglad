# @flowglad/express

> **This package is deprecated.**
>
> Please use `@flowglad/server/express` instead.

## Migration Guide

### Installation

**Before:**
```bash
npm install @flowglad/express
```

**After:**
```bash
npm install @flowglad/server express
```

### Imports

**Before:**
```ts
import { createFlowgladExpressRouter, FlowgladServer } from '@flowglad/express'
```

**After:**
```ts
import { createFlowgladExpressRouter } from '@flowglad/server/express'
import { FlowgladServer } from '@flowglad/server'
```

### API Compatibility

The API is fully compatible. No changes are required to your route handlers or middleware configuration - just update the import paths.

See the [Express SDK documentation](https://docs.flowglad.com/sdks/express) for complete migration instructions.
