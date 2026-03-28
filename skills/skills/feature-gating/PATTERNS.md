# Feature Gating Patterns

Reference patterns for advanced feature gating with Flowglad. See [SKILL.md](./SKILL.md) for core guidance.

## Higher-Order Component Pattern

Use the HOC pattern when you need to gate entire pages or wrap components that cannot use the `<FeatureGate>` component directly.

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

For better UX without flash, prefer server-side gating (see Section 5.2 in SKILL.md) when possible.

## Middleware Pattern for Multi-Route Gating

Use Next.js middleware to gate multiple premium routes without repeating checks in each page.

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PREMIUM_ROUTES = ['/analytics', '/export', '/api-access']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PREMIUM_ROUTES.some((route) => pathname.startsWith(route))) {
    // Check a session flag or JWT claim set during login
    // that indicates subscription tier
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

Note: Full Flowglad billing checks in middleware require additional setup. For most cases, server component checks are simpler and recommended.
