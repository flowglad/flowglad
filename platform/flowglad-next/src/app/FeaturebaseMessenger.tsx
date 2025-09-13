'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { useAuthContext } from '../contexts/authContext'

declare global {
  interface Window {
    Featurebase?: ((...args: any[]) => void) & { q?: unknown[] }
  }
}

export default function FeaturebaseMessenger() {
  const appId = process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID
  const { user } = useAuthContext()
  const [userHash, setUserHash] = useState<string | null>(null)
  const bootedRef = useRef(false)

  useEffect(() => {
    if (!appId || !user) return
    const fetchHash = async () => {
      try {
        const res = await fetch('/api/featurebase/user-hash', {
          method: 'GET',
          headers: { 'cache-control': 'no-store' },
        })
        if (res.ok) {
          const json = await res.json()
          setUserHash(json.userHash ?? null)
        } else {
          setUserHash(null)
        }
      } catch (error) {
        setUserHash(null)
      }
    }
    fetchHash()
  }, [appId, user])

  useEffect(() => {
    if (!appId || !user || !userHash) return
    if (bootedRef.current) return

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

    const payload = {
      appId,
      email: user.email,
      userId: user.id,
      userHash,
    }
    browserWindow.Featurebase!('boot', payload)
    bootedRef.current = true
  }, [appId, user, userHash])

  if (!appId || !user) {
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
