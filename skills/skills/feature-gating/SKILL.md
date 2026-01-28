---
name: flowglad-feature-gating
description: Implement feature access checks using Flowglad to gate premium features, create paywalls, and restrict functionality based on subscription status. Use this skill when adding paid-only features or checking user entitlements.
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

---

## 1. Loading State Handling

**Impact: CRITICAL**

The billing hook loads asynchronously. While loading, `checkFeatureAccess` is `null` (not a function). If you try to call it before loading completes, you'll get a runtime error or incorrect behavior. This causes premium users to see upgrade prompts or paywalls incorrectly.

> **Note:** The `flowglad()` factory function used in server-side examples must be set up in your project (typically at `@/lib/flowglad`). See the [setup skill](../setup/SKILL.md) for configuration instructions.

### 1.1 Wait for Billing to Load

**Impact: CRITICAL (prevents flash of incorrect content)**

Users with active subscriptions will see upgrade prompts flash briefly if you don't wait for billing to load before checking access.

**Incorrect: checks access before billing loads**

```tsx
function PremiumFeature() {
  const { checkFeatureAccess } = useBilling()

  // BUG: checkFeatureAccess is null while loading!
  // This will throw: "checkFeatureAccess is not a function"
  if (!checkFeatureAccess('premium-feature')) {
    return <UpgradePrompt />
  }

  return <PremiumContent />
}
```

This crashes because `checkFeatureAccess` is `null` until billing data loads, not a callable function.

**Correct: check both loaded and checkFeatureAccess**

```tsx
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

Always check both `loaded` and `checkFeatureAccess` before calling the function to ensure billing data is available.

### 1.2 Skeleton Loading Patterns

**Impact: CRITICAL (prevents layout shift)**

Show appropriate loading states that match the expected content dimensions to prevent layout shift.

**Incorrect: shows nothing or spinner**

```tsx
function Dashboard() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded) {
    return null // Content disappears!
  }

  return <DashboardContent />
}
```

**Correct: show skeleton matching content layout**

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

Client-side feature checks are for UI purposes only. Any sensitive operation or data access must verify subscription status server-side. Users can bypass client-side checks by modifying frontend code or using browser developer tools.

### 2.1 Verify Access on Server

**Impact: HIGH (security requirement)**

Never trust client-side access checks for operations that cost money, access sensitive data, or perform privileged actions.

**Incorrect: trusts client-side check for sensitive operation**

```typescript
// API route
export async function POST(req: Request) {
  // Client could bypass this by modifying frontend code
  const { hasAccess } = await req.json()
  if (!hasAccess) {
    return Response.json({ error: 'No access' }, { status: 403 })
  }
  return performSensitiveOperation()
}
```

**Correct: verify server-side**

```typescript
// API route
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

Create a reusable pattern for protecting multiple API routes with feature checks.

**Incorrect: duplicates check logic everywhere**

```typescript
// routes/generate.ts
export async function POST(req: Request) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()
  if (!billing.checkFeatureAccess('ai-generation')) {
    return Response.json({ error: 'Upgrade required' }, { status: 403 })
  }
  // ... generation logic
}

// routes/export.ts
export async function POST(req: Request) {
  const session = await auth()
  const billing = await flowglad(session.user.id).getBilling()
  if (!billing.checkFeatureAccess('export')) {
    return Response.json({ error: 'Upgrade required' }, { status: 403 })
  }
  // ... export logic
}
```

**Correct: create reusable middleware/helper**

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

// routes/generate.ts
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

How you reference features affects code maintainability and environment portability.

### 3.1 Use Slugs Not IDs

**Impact: MEDIUM (environment portability)**

Feature IDs are auto-generated and differ between development, staging, and production environments. Slugs are stable identifiers you control.

**Incorrect: hardcoding Flowglad IDs**

```typescript
// IDs change between environments!
if (billing.checkFeatureAccess('feat_abc123xyz')) {
  // Works in dev, breaks in production
}
```

**Correct: use slugs**

```typescript
// Slugs are stable across environments
if (billing.checkFeatureAccess('advanced-analytics')) {
  // Works everywhere
}
```

Define feature slugs in your Flowglad dashboard and reference them consistently in code.

---

## 4. Component Wrapper Patterns

**Impact: MEDIUM**

Reusable patterns for gating components reduce boilerplate and ensure consistent behavior.

### 4.1 Feature Gate Component

**Impact: MEDIUM (reduces boilerplate)**

Create a declarative component for gating content.

**Incorrect: repeats gate logic in every component**

```tsx
function AnalyticsDashboard() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) return <Skeleton />
  if (!checkFeatureAccess('analytics')) return <UpgradePrompt feature="analytics" />

  return <Analytics />
}

function ExportButton() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) return <Skeleton />
  if (!checkFeatureAccess('export')) return <UpgradePrompt feature="export" />

  return <ExportUI />
}
```

**Correct: create reusable FeatureGate component**

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

Use HOC pattern when you need to gate entire pages or components.

**Incorrect: duplicates page-level checks**

```tsx
// pages/analytics.tsx
export default function AnalyticsPage() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) return <PageSkeleton />
  if (!checkFeatureAccess('analytics')) {
    // Using redirect() in a client component - this won't work!
    redirect('/pricing')
    return null
  }

  return <AnalyticsDashboard />
}
```

**Correct: create withFeatureAccess HOC**

```tsx
'use client'

// lib/withFeatureAccess.tsx
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBilling } from '@flowglad/nextjs'
import { ComponentType } from 'react'

export function withFeatureAccess<P extends object>(
  WrappedComponent: ComponentType<P>,
  feature: string,
  redirectTo = '/pricing'
) {
  return function WithFeatureAccess(props: P) {
    const { loaded, checkFeatureAccess } = useBilling()
    const router = useRouter()

    useEffect(() => {
      if (loaded && checkFeatureAccess && !checkFeatureAccess(feature)) {
        router.push(redirectTo)
      }
    }, [loaded, checkFeatureAccess, router])

    if (!loaded || !checkFeatureAccess) {
      return <PageSkeleton />
    }

    if (!checkFeatureAccess(feature)) {
      // Show skeleton while redirecting
      return <PageSkeleton />
    }

    return <WrappedComponent {...props} />
  }
}

// Usage
function AnalyticsDashboard() {
  return <div>Analytics content</div>
}

export default withFeatureAccess(AnalyticsDashboard, 'analytics')
```

Note: For better UX without flash, prefer server-side gating (see Section 5.2) when possible.

---

## 5. Redirect to Upgrade Patterns

**Impact: MEDIUM**

When users lack access, redirect them to upgrade rather than showing error states.

### 5.1 Client-Side Redirect

**Impact: MEDIUM (better UX than error states)**

Redirect users to pricing/upgrade page when they try to access gated features.

**Incorrect: shows error message**

```tsx
function PremiumPage() {
  const { loaded, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) return <Skeleton />

  if (!checkFeatureAccess('premium')) {
    return <div>Error: You don't have access to this feature</div>
  }

  return <PremiumContent />
}
```

**Correct: redirect to upgrade with context**

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
      // Redirect with return URL so user comes back after upgrade
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

For server components or middleware, check access server-side before rendering.

**Incorrect: client-side check causes flash**

```tsx
// Page loads, then redirects - user sees flash
export default function PremiumPage() {
  return (
    <ClientSideGate feature="premium">
      <PremiumContent />
    </ClientSideGate>
  )
}
```

**Correct: check in server component or middleware**

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

Or using middleware for multiple routes:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PREMIUM_ROUTES = ['/analytics', '/export', '/api-access']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if this is a premium route
  if (PREMIUM_ROUTES.some((route) => pathname.startsWith(route))) {
    // Note: Full billing check requires server-side call
    // For middleware, you might check a session flag or JWT claim
    // set during login that indicates subscription tier
    const session = await getSession(request)

    if (!session?.isPremium) {
      return NextResponse.redirect(
        new URL(`/pricing?returnTo=${pathname}`, request.url)
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/analytics/:path*', '/export/:path*', '/api-access/:path*'],
}
```

Note: Full Flowglad billing checks in middleware require additional setup. For most cases, server component checks (pattern above) are simpler and recommended.
