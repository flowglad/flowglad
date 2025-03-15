'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useAuth, useUser } from '@clerk/nextjs'

export default function PostHogPageView(): null {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  // 👉 Add the hooks into the component
  const { isSignedIn, userId } = useAuth()
  const { user } = useUser()

  // Track pageviews
  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      if (searchParams.toString()) {
        url = url + `?${searchParams.toString()}`
      }
      posthog.capture('$pageview', {
        $current_url: url,
      })
    }
  }, [pathname, searchParams, posthog])

  useEffect(() => {
    // 👉 Check the sign-in status and user info,
    //    and identify the user if they aren't already
    if (isSignedIn && userId && user && !posthog._isIdentified()) {
      // 👉 Identify the user
      posthog.identify(userId, {
        email: user.primaryEmailAddress?.emailAddress,
        username: user.username,
      })
    }
  }, [posthog, user, isSignedIn, userId])

  return null
}
