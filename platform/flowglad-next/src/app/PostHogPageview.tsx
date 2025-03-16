'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import { AuthContextValues } from '@/contexts/authContext'

export default function PostHogPageView({
  user,
}: Pick<AuthContextValues, 'user'>): null {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

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
    if (user && !posthog._isIdentified()) {
      // 👉 Identify the user
      posthog.identify(user.id, {
        email: user.primary_email!,
        username: user.display_name!,
      })
    }
  }, [posthog, user])

  return null
}
