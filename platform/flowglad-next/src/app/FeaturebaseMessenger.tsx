'use client'

import { useEffect } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    Featurebase?: ((...args: any[]) => void) & { q?: unknown[] }
  }
}

export default function FeaturebaseMessenger() {
  const appId = process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID

  useEffect(() => {
    if (!appId) {
      // Silently no-op if not configured in this environment
      return
    }

    const browserWindow = window as Window

    if (typeof browserWindow.Featurebase !== 'function') {
      type FeaturebaseFunction = ((...args: unknown[]) => void) & {
        q?: unknown[]
      }
      const queuedCalls: unknown[] = []
      const featurebaseShim = ((...args: unknown[]) => {
        queuedCalls.push(args)
      }) as FeaturebaseFunction
      featurebaseShim.q = queuedCalls
      browserWindow.Featurebase = featurebaseShim
    }

    browserWindow.Featurebase!('boot', {
      appId,
      // Add additional user context when available. Avoid adding user data
      // unless Identity Verification (userHash) is configured per docs.
      // theme: 'light',
      // language: 'en',
    })
  }, [appId])

  if (!appId) {
    return null
  }

  return (
    <Script
      src="https://do.featurebase.app/js/sdk.js"
      id="featurebase-sdk"
      strategy="afterInteractive"
    />
  )
}


