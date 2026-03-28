---
name: flowglad-feature-gating
description: "Implement feature access checks using Flowglad to gate premium features, create paywalls, and restrict functionality based on subscription status. Use when adding paywall, monetization, pro features, freemium, upgrade prompt, feature flags, paid-only features, or checking user entitlements."
license: MIT
metadata:
  author: flowglad
  version: "1.0.0"
---

<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/sdks/feature-access-usage.mdx
-->

# Feature Gating

## Abstract

Implement feature access checks using Flowglad's `checkFeatureAccess` method to gate premium features, create paywalls, and restrict functionality based on subscription status.

---

## Table of Contents

1. [Loading State Handling](#1-loading-state-handling) — **CRITICAL**
   - 1.1 [Wait for Billing to Load](#11-wait-for-billing-to-load)
   - 1.2 [Skeleton Loading Patterns](#12-skeleton-loading-patterns)
2. [Server-Side Gating](#2-server-side-gating) — **HIGH**
   - 2.1 [Verify Access on Server](#21-verify-access-on-server)
   - 2.2 [API Route Protection](#22-api-route-protection)
3. [Feature Identification](#3-feature-identification) — **MEDIUM**
   - 3.1 [Use Slugs Not IDs](#31-use-slugs-not-ids)
4. [Component Wrapper Patterns](#4-component-wrapper-patterns) — **MEDIUM**
   - 4.1 [Feature Gate Component](#41-feature-gate-component)
   - 4.2 [Higher-Order Component Pattern](#42-higher-order-component-pattern)
5. [Redirect to Upgrade Patterns](#5-redirect-to-upgrade-patterns) — **MEDIUM**
   - 5.1 [Client-Side Redirect](#51-client-side-redirect)
   - 5.2 [Server-Side Redirect](#52-server-side-redirect)
6. [Validation and Testing](#6-validation-and-testing) — **MEDIUM**
   - 6.1 [Verifying Feature Gating](#61-verifying-feature-gating)

---

## 1. Loading State Handling

**Impact: CRITICAL**

The billing hook loads asynchronously. While loading, `checkFeatureAccess` is `null` (not a function). Calling it before loading completes causes runtime errors or shows upgrade prompts to paying users.

> **Note:** The `flowglad()` factory function used in server-side examples must be set up in your project (typically at `@/lib/flowglad`). See the [setup skill](../setup/SKILL.md) for configuration instructions.

### 1.1 Wait for Billing to Load

**Impact: CRITICAL (prevents flash of incorrect content)**

```tsx
// INCORRECT: checkFeatureAccess is null while loading — this throws
function PremiumFeature() {
  const { checkFeatureAccess } = useBilling()
  if (!checkFeatureAccess('premium-feature')) {
    return <UpgradePrompt />
  }
  return <PremiumContent />
}

// CORRECT: check both loaded and checkFeatureAccess
function PremiumFeature() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) {
    return <LoadingSkeleton />
  }

  if (!checkFeatureAccess('premium-feature')) {
    return <UpgradePrompt />
  }

  return <PremiumContent />
}
```

Always check both `loaded` and `checkFeatureAccess` before calling the function.

### 1.2 Skeleton Loading Patterns

**Impact: CRITICAL (prevents layout shift)**

Show loading states that match expected content dimensions to prevent layout shift.

```tsx
function Dashboard() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="h-64 bg-gray-200 animate-pulse rounded" />
      </div>
    )
  }

  return <DashboardContent />
}
```

---

## 2. Server-Side Gating

**Impact: HIGH**

Client-side feature checks are for UI purposes only. Sensitive operations and data access must verify subscription status server-side.

### 2.1 Verify Access on Server

**Impact: HIGH (security requirement)**

Never trust client-side access checks for operations that cost money, access sensitive data, or perform privileged actions.

```typescript
// INCORRECT: trusts a client-sent flag
export async function POST(req: Request) {
  const { hasAccess } = await req.json()
  if (!hasAccess) {
    return Response.json({ error: 'No access' }, { status: 403 })
  }
  return performSensitiveOperation()
}

// CORRECT: verify server-side with Flowglad
import { flowglad } from '@/lib/flowglad'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const billing = await flowglad(session.user.id).getBilling()

  if (!billing.checkFeatureAccess('api-access')) {
    return Response.json({ error: 'Upgrade required' }, { status: 403 })
  }

  return performSensitiveOperation()
}
```

### 2.2 API Route Protection

**Impact: HIGH (prevents unauthorized access)**

Create a reusable helper to avoid duplicating billing checks across routes.

```typescript
// lib/requireFeature.ts
import { flowglad } from '@/lib/flowglad'
import { auth } from '@/lib/auth'

export async function requireFeature(featureSlug: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: 'Unauthorized', status: 401 }
  }

  const billing = await flowglad(session.user.id).getBilling()

  if (!billing.checkFeatureAccess(featureSlug)) {
    return { error: 'Upgrade required', status: 403 }
  }

  return { userId: session.user.id, billing }
}

// Usage in any route
export async function POST(req: Request) {
  const result = await requireFeature('ai-generation')
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { userId, billing } = result
  // ... generation logic
}
```

---

## 3. Feature Identification

**Impact: MEDIUM**

### 3.1 Use Slugs Not IDs

**Impact: MEDIUM (environment portability)**

Feature IDs are auto-generated and differ between environments. Slugs are stable identifiers you control.

```typescript
// INCORRECT: IDs change between environments
if (billing.checkFeatureAccess('feat_abc123xyz')) { ... }

// CORRECT: slugs are stable across environments
if (billing.checkFeatureAccess('advanced-analytics')) { ... }
```

Define feature slugs in your Flowglad dashboard and reference them consistently in code.

---

## 4. Component Wrapper Patterns

**Impact: MEDIUM**

Reusable patterns for gating components reduce boilerplate and ensure consistent behavior.

### 4.1 Feature Gate Component

**Impact: MEDIUM (reduces boilerplate)**

Create a declarative component for gating content instead of repeating loading/access checks in every component.

```tsx
// components/FeatureGate.tsx
import { useBilling } from '@flowglad/nextjs'
import { ReactNode } from 'react'

interface FeatureGateProps {
  feature: string
  children: ReactNode
  fallback?: ReactNode
  loading?: ReactNode
}

export function FeatureGate({
  feature,
  children,
  fallback = <UpgradePrompt />,
  loading = <Skeleton />,
}: FeatureGateProps) {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) {
    return <>{loading}</>
  }

  if (!checkFeatureAccess(feature)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

// Usage
function AnalyticsDashboard() {
  return (
    <FeatureGate feature="analytics">
      <Analytics />
    </FeatureGate>
  )
}

function ExportButton() {
  return (
    <FeatureGate feature="export" fallback={<LockedExportButton />}>
      <ExportUI />
    </FeatureGate>
  )
}
```

### 4.2 Higher-Order Component Pattern

**Impact: MEDIUM (alternative pattern for class components or full-page gates)**

Use the HOC pattern when you need to gate entire pages or components. See [PATTERNS.md](./PATTERNS.md#higher-order-component-pattern) for the full `withFeatureAccess` implementation and usage examples.

---

## 5. Redirect to Upgrade Patterns

**Impact: MEDIUM**

When users lack access, redirect them to upgrade rather than showing error states.

### 5.1 Client-Side Redirect

**Impact: MEDIUM (better UX than error states)**

Redirect users to a pricing/upgrade page when they try to access gated features, preserving a return URL so they come back after upgrading.

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useBilling } from '@flowglad/nextjs'

function PremiumPage() {
  const { loaded, checkFeatureAccess } = useBilling()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loaded && checkFeatureAccess && !checkFeatureAccess('premium')) {
      router.push(`/pricing?upgrade=premium&returnTo=${encodeURIComponent(pathname)}`)
    }
  }, [loaded, checkFeatureAccess, router, pathname])

  if (!loaded || !checkFeatureAccess || !checkFeatureAccess('premium')) {
    return <Skeleton />
  }

  return <PremiumContent />
}
```

### 5.2 Server-Side Redirect

**Impact: MEDIUM (prevents page flash)**

For server components, check access server-side before rendering to avoid any flash of gated content.

```tsx
// app/premium/page.tsx (Server Component)
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { flowglad } from '@/lib/flowglad'

export default async function PremiumPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const billing = await flowglad(session.user.id).getBilling()

  if (!billing.checkFeatureAccess('premium')) {
    redirect('/pricing?upgrade=premium')
  }

  return <PremiumContent />
}
```

For middleware-based multi-route gating, see [PATTERNS.md](./PATTERNS.md#middleware-pattern-for-multi-route-gating).

---

## 6. Validation and Testing

**Impact: MEDIUM**

Verify that feature gating works correctly across subscription states.

### 6.1 Verifying Feature Gating

Test these scenarios to confirm correct gating behavior:

| Scenario | Expected Result |
|----------|----------------|
| User with active subscription | Feature renders, no upgrade prompt |
| User without subscription | Upgrade prompt or redirect shown |
| Billing still loading | Loading skeleton shown (no flash) |
| Server-side check with no session | 401 Unauthorized response |
| Server-side check without feature access | 403 Upgrade required response |
| Expired subscription | Treated as no access |

```typescript
// Example: integration test for requireFeature helper
import { requireFeature } from '@/lib/requireFeature'

// Verify gated route rejects unauthenticated requests
const unauthResult = await requireFeature('premium')
expect(unauthResult).toEqual({ error: 'Unauthorized', status: 401 })

// Verify gated route rejects users without the feature
// (with authenticated user who lacks the feature)
const noAccessResult = await requireFeature('premium')
expect(noAccessResult).toEqual({ error: 'Upgrade required', status: 403 })

// Verify gated route allows users with the feature
const accessResult = await requireFeature('premium')
expect('userId' in accessResult).toBe(true)
```

For client-side validation, confirm that:
- The `<FeatureGate>` component shows its `loading` prop while `loaded` is false
- The `fallback` prop renders when `checkFeatureAccess` returns false
- The `children` render when access is granted
