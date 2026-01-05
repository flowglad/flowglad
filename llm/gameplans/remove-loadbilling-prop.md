# Gameplan: Remove `loadBilling` Prop and Add `usePricing()` Hook

## Current State Analysis

The `FlowgladProvider` requires a `loadBilling: boolean` prop that gates whether billing data is fetched on mount. This creates problems:

1. **Awkward API**: Users must track auth state and pass `loadBilling={!!session}` (see `playground/generation-based-subscription/src/components/providers.tsx:51`)
2. **All routes require auth**: Every request goes through `getCustomerExternalId()` in `packages/server/src/requestHandler.ts:115`, even for public data like pricing
3. **No lazy loading**: Billing fetches immediately on mount when `loadBilling=true`, not when actually needed

**Current flow**:
```
FlowgladProvider loadBilling={true}
  → FlowgladContextProvider (packages/react/src/FlowgladContext.tsx:458)
    → useQuery enabled: loadBilling (line 475)
      → fetchCustomerBilling() POST /api/flowglad/customers/billing
        → getCustomerExternalId(req) [ALWAYS REQUIRES AUTH]
```

**Key files**:
- `packages/react/src/FlowgladProvider.tsx:20` - Defines `loadBilling` prop
- `packages/react/src/FlowgladContext.tsx:475` - `useQuery` gated by `loadBilling`
- `packages/server/src/requestHandler.ts:115` - All routes call `getCustomerExternalId`
- `packages/shared/src/types/sdk.ts:4` - `FlowgladActionKey` enum

---

## Required Changes

### 1. Add public route configuration

**File**: `packages/shared/src/types/sdk.ts:4-15`

Add new action key:
```ts
export enum FlowgladActionKey {
  // ... existing keys
  GetDefaultPricingModel = 'pricing-models/default',
}
```

**File**: `packages/shared/src/actions.ts:312-358`

Add validator and public route marker:
```ts
export const publicActionKeys: Set<FlowgladActionKey> = new Set([
  FlowgladActionKey.GetDefaultPricingModel,
])

export const isPublicActionKey = (key: FlowgladActionKey): boolean =>
  publicActionKeys.has(key)

// Add to flowgladActionValidators object:
[FlowgladActionKey.GetDefaultPricingModel]: {
  method: HTTPMethod.GET,
  inputValidator: z.object({}),
}
```

### 2. Create pricing handler

**File**: `packages/server/src/subrouteHandlers/pricingHandlers.ts` (NEW FILE)

```ts
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'

export const getDefaultPricingModel = async (
  params: { method: HTTPMethod; data: unknown },
  admin: FlowgladServerAdmin
): Promise<{ data: unknown; status: number; error?: { message: string } }> => {
  if (params.method !== HTTPMethod.GET) {
    return { data: {}, status: 405, error: { message: 'Method not allowed' } }
  }
  const result = await admin.getDefaultPricingModel()
  return { data: result, status: 200 }
}
```

**File**: `packages/server/src/subrouteHandlers/index.ts`

Add export:
```ts
import { getDefaultPricingModel } from './pricingHandlers'

export const publicRouteToHandlerMap = {
  [FlowgladActionKey.GetDefaultPricingModel]: getDefaultPricingModel,
}
```

### 3. Modify request handler for public routes

**File**: `packages/server/src/requestHandler.ts:46-78`

Update `RequestHandlerOptions` interface:
```ts
export interface RequestHandlerOptions<TRequest> {
  getCustomerExternalId: (req: TRequest) => Promise<string>
  flowglad: (customerExternalId: string) => Promise<FlowgladServer> | FlowgladServer
  flowgladAdmin?: () => FlowgladServerAdmin  // NEW - optional
  onError?: (error: unknown) => void
  beforeRequest?: () => Promise<void>
  afterRequest?: () => Promise<void>
}
```

**File**: `packages/server/src/requestHandler.ts:106-120`

Insert public route handling before auth check:
```ts
// Insert at line ~118, before getCustomerExternalId call:
if (isPublicActionKey(joinedPath)) {
  if (!options.flowgladAdmin) {
    throw new RequestHandlerError('Public routes require flowgladAdmin option', 501)
  }
  const admin = options.flowgladAdmin()
  const handler = publicRouteToHandlerMap[joinedPath]
  return handler({ method: input.method, data: input.query ?? input.body }, admin)
}
```

### 4. Update Next.js route handler

**File**: `packages/nextjs/src/nextRouteHandler.ts:8-38`

Update interface:
```ts
export interface NextRouteHandlerOptions {
  getCustomerExternalId: (req: NextRequest) => Promise<string>
  flowglad: (customerExternalId: string) => Promise<FlowgladServer> | FlowgladServer
  flowgladAdmin?: () => FlowgladServerAdmin  // NEW
  onError?: (error: unknown) => void
  beforeRequest?: () => Promise<void>
  afterRequest?: () => Promise<void>
}
```

**File**: `packages/nextjs/src/nextRouteHandler.ts:117-124`

Pass through to requestHandler:
```ts
const handler = requestHandler({
  getCustomerExternalId,
  flowglad,
  flowgladAdmin,  // NEW
  onError,
  beforeRequest,
  afterRequest,
})
```

### 5. Remove `loadBilling` from provider

**File**: `packages/react/src/FlowgladProvider.tsx:16-21`

```ts
// BEFORE
export interface LoadedFlowgladProviderProps {
  children: React.ReactNode
  requestConfig?: RequestConfig
  baseURL?: string
  loadBilling: boolean
}

// AFTER
export interface FlowgladProviderProps {
  children: React.ReactNode
  requestConfig?: RequestConfig
  baseURL?: string
}
```

**File**: `packages/react/src/FlowgladProvider.tsx:47-56`

Remove destructuring of `loadBilling` and passing to context.

### 6. Implement lazy billing + usePricing in context

**File**: `packages/react/src/FlowgladContext.tsx:461`

Add state for lazy trigger:
```ts
const [billingRequested, setBillingRequested] = useState(false)
const triggerBillingLoad = useCallback(() => setBillingRequested(true), [])
```

**File**: `packages/react/src/FlowgladContext.tsx:469-483`

Modify billing useQuery:
```ts
const {
  isPending: isPendingBilling,
  error: errorBilling,
  data: billing,
} = useQuery<CustomerBillingRouteResponse | null>({
  queryKey: [FlowgladActionKey.GetCustomerBilling],
  enabled: billingRequested,  // Changed from: Boolean(coreProps?.loadBilling)
  queryFn: coreProps
    ? () => fetchCustomerBilling({ baseURL: coreProps.baseURL, requestConfig: coreProps.requestConfig })
    : async () => null,
})
```

**File**: `packages/react/src/FlowgladContext.tsx:456` (NEW - add after fetchCustomerBilling)

Add pricing fetch:
```ts
const fetchPricingModel = async ({
  baseURL,
  requestConfig,
}: Pick<CoreFlowgladContextProviderProps, 'baseURL' | 'requestConfig'>): Promise<{
  data?: { pricingModel: unknown } | null
  error?: { message: string } | null
}> => {
  const fetchImpl = requestConfig?.fetch ?? fetch
  const flowgladRoute = getFlowgladRoute(baseURL)
  const response = await fetchImpl(
    `${flowgladRoute}/${FlowgladActionKey.GetDefaultPricingModel}`,
    { method: 'GET', headers: requestConfig?.headers }
  )
  return response.json()
}
```

**File**: `packages/react/src/FlowgladContext.tsx:484` (NEW - add after billing useQuery)

Add pricing useQuery:
```ts
const {
  isPending: isPendingPricing,
  error: errorPricing,
  data: pricingData,
} = useQuery({
  queryKey: [FlowgladActionKey.GetDefaultPricingModel],
  queryFn: () => fetchPricingModel({ baseURL, requestConfig }),
  enabled: !isDevMode,
})
```

**File**: `packages/react/src/FlowgladContext.tsx:52-130`

Update context types - remove `loadBilling`, add `isLoading`:
```ts
export interface LoadedFlowgladContextValues extends BillingWithChecks {
  loaded: true
  isLoading: false
  triggerBillingLoad?: undefined
  // ... rest unchanged
}

export interface NotLoadedFlowgladContextValues extends NonPresentContextValues {
  loaded: false
  isLoading: boolean
  triggerBillingLoad: () => void
  errors: null
}
```

**File**: `packages/react/src/FlowgladContext.tsx:761`

Modify useBilling hook:
```ts
export const useBilling = () => {
  const context = useContext(FlowgladContext)

  useEffect(() => {
    if (context.triggerBillingLoad) {
      context.triggerBillingLoad()
    }
  }, [context.triggerBillingLoad])

  return context
}
```

**File**: `packages/react/src/FlowgladContext.tsx:767` (NEW - after useBilling)

Add usePricing hook:
```ts
export interface PricingContextValue {
  loaded: boolean
  isLoading: boolean
  pricingModel: unknown | null
  error: Error | null
}

export const usePricing = (): PricingContextValue => {
  const { pricingData, isPendingPricing, errorPricing } = useContext(FlowgladInternalContext)
  return {
    loaded: !isPendingPricing && pricingData !== undefined,
    isLoading: isPendingPricing,
    pricingModel: pricingData?.data?.pricingModel ?? null,
    error: errorPricing ?? null,
  }
}
```

### 7. Update exports

**File**: `packages/react/src/index.ts`

```ts
export { useBilling, usePricing, useCatalog } from './FlowgladContext'
```

---

## Acceptance Criteria

- [ ] `FlowgladProvider` no longer accepts `loadBilling` prop
- [ ] `useBilling()` triggers billing fetch on first call (lazy loading)
- [ ] `useBilling()` returns `{ loaded: false, isLoading: true }` while loading
- [ ] `useBilling()` returns auth error when user is not authenticated
- [ ] `usePricing()` returns pricing model without requiring authentication
- [ ] `usePricing()` works even when user is not logged in
- [ ] `GET /api/flowglad/pricing-models/default` returns pricing without auth
- [ ] Dev mode (`__devMode`) continues to work with mocked data
- [ ] Existing `useCatalog()` hook continues to work
- [ ] TypeScript compiles without errors

---

## Open Questions

1. **Should `flowgladAdmin` be required or optional?** If user doesn't provide it, should public routes return 404 or 501?

2. **Cache duration for pricing**: Should `usePricing()` have configurable staleTime, or use React Query defaults?

3. **Error handling for lazy billing**: When `useBilling()` is called but auth fails, should we surface the error immediately or let the component handle it?

---

## Explicit Opinions

1. **Use separate useQuery for pricing vs billing**. Keeps them independent - pricing always fetches, billing only when `useBilling()` is called. Simpler than trying to share state.

2. **Keep pricing in same context provider**. Creating a separate `PricingProvider` is overkill - add a second `useQuery` in the existing provider and expose via separate hook.

3. **`flowgladAdmin` is optional**. If not provided, public routes return 501 Not Implemented. Backwards-compatible - existing integrations don't break, they just can't use public routes.

4. **Trigger billing via useEffect in `useBilling()`**. Cleanest way to implement lazy loading without requiring components to explicitly call a `loadBilling()` function.

5. **Remove `loadBilling` from context values**. Replace with `isLoading: boolean` which is more semantically correct.

---

## PRs

### PR 1: Add public route infrastructure (server-side)

**Files to create/modify**:
- `packages/shared/src/types/sdk.ts` - Add `GetDefaultPricingModel` to enum
- `packages/shared/src/actions.ts` - Add validator, `publicActionKeys`, `isPublicActionKey`
- `packages/server/src/subrouteHandlers/pricingHandlers.ts` - NEW FILE
- `packages/server/src/subrouteHandlers/index.ts` - Export `publicRouteToHandlerMap`
- `packages/server/src/requestHandler.ts` - Add `flowgladAdmin` option, public route branching

**Test cases**:
```ts
describe('requestHandler with public routes', () => {
  describe('GetDefaultPricingModel route', () => {
    it('should return pricing model without authentication', async () => {
      // setup: create requestHandler with flowgladAdmin, mock getDefaultPricingModel
      // action: call handler with path ['pricing-models', 'default'], method GET
      // expect: status 200, data contains pricingModel
    })

    it('should return 405 for non-GET requests', async () => {
      // setup: create requestHandler with flowgladAdmin
      // action: call handler with path ['pricing-models', 'default'], method POST
      // expect: status 405
    })

    it('should return 501 when flowgladAdmin not provided', async () => {
      // setup: create requestHandler WITHOUT flowgladAdmin
      // action: call handler with path ['pricing-models', 'default'], method GET
      // expect: status 501
    })
  })

  describe('protected routes still require auth', () => {
    it('should call getCustomerExternalId for GetCustomerBilling', async () => {
      // setup: create requestHandler, mock getCustomerExternalId
      // action: call handler with path ['customers', 'billing'], method POST
      // expect: getCustomerExternalId was called
    })
  })
})
```

### PR 2: Add `usePricing()` hook (react-side)

**Files to modify**:
- `packages/react/src/FlowgladContext.tsx` - Add `fetchPricingModel`, pricing useQuery, `usePricing` hook
- `packages/react/src/index.ts` - Export `usePricing`

**Test cases**:
```ts
describe('usePricing hook', () => {
  it('should fetch pricing on mount without auth', async () => {
    // setup: render component using usePricing inside FlowgladProvider
    // setup: mock fetch to return pricing data
    // expect: usePricing returns { loaded: true, pricingModel: {...} }
  })

  it('should return isLoading: true while fetching', async () => {
    // setup: render component, delay mock response
    // expect: initially { loaded: false, isLoading: true }
    // expect: after resolve { loaded: true, isLoading: false }
  })

  it('should return error when fetch fails', async () => {
    // setup: mock fetch to reject
    // expect: { loaded: true, error: Error }
  })
})
```

### PR 3: Convert `useBilling()` to lazy loading

**Files to modify**:
- `packages/react/src/FlowgladContext.tsx` - Add `billingRequested` state, `triggerBillingLoad`, modify useQuery enabled, update useBilling hook

**Test cases**:
```ts
describe('useBilling lazy loading', () => {
  it('should not fetch billing until useBilling is called', async () => {
    // setup: render FlowgladProvider WITHOUT any component calling useBilling
    // expect: no fetch to /customers/billing endpoint
  })

  it('should trigger fetch on first useBilling call', async () => {
    // setup: render component that calls useBilling
    // expect: fetch to /customers/billing is made
    // expect: initially { loaded: false, isLoading: true }
  })

  it('should only fetch once across multiple useBilling calls', async () => {
    // setup: render two components both calling useBilling
    // expect: only one fetch made (React Query deduplication)
  })

  it('should return error when auth fails', async () => {
    // setup: mock fetch to return 401
    // expect: { loaded: true, errors: [Error] }
  })
})
```

### PR 4: Remove `loadBilling` prop from provider

**Files to modify**:
- `packages/react/src/FlowgladProvider.tsx` - Remove `loadBilling` from interface and usage
- `packages/react/src/FlowgladContext.tsx` - Remove `loadBilling` from context types, replace with `isLoading`
- `playground/generation-based-subscription/src/components/providers.tsx` - Remove `loadBilling` usage

**Test cases**:
```ts
describe('FlowgladProvider without loadBilling', () => {
  it('should render without loadBilling prop', () => {
    // setup: render <FlowgladProvider>{children}</FlowgladProvider>
    // expect: renders successfully without error
  })
})

describe('context values', () => {
  it('should have isLoading instead of loadBilling', () => {
    // setup: render component using useBilling
    // expect: context has isLoading: boolean
    // expect: context does NOT have loadBilling property
  })
})
```

### PR 5: Update Next.js handler and exports

**Files to modify**:
- `packages/nextjs/src/nextRouteHandler.ts` - Add `flowgladAdmin` option
- `packages/nextjs/src/index.ts` - Re-export `FlowgladServerAdmin`

**Test cases**:
```ts
describe('nextRouteHandler with flowgladAdmin', () => {
  it('should pass flowgladAdmin to requestHandler', async () => {
    // setup: create handler with flowgladAdmin option
    // action: make request to pricing-models/default
    // expect: returns pricing without requiring auth
  })

  it('should work without flowgladAdmin for backward compatibility', async () => {
    // setup: create handler WITHOUT flowgladAdmin
    // action: make request to customers/billing (protected route)
    // expect: works as before
  })
})
```

---

## Parallelization

```
PR 1 (public route infrastructure)
  │
  ├──> PR 2 (usePricing hook) ─────────────────────┐
  │                                                 │
  └──> PR 3 (lazy useBilling) ──> PR 4 (remove prop) ──> PR 5 (nextjs exports)
```

- **PR 1** must land first (server-side foundation)
- **PR 2** and **PR 3** can run in parallel after PR 1
- **PR 4** depends on PR 3 (need lazy loading before removing prop)
- **PR 5** can start after PR 1, but should land last to coordinate exports
