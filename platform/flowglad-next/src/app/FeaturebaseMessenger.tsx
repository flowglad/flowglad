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
  const lastBootKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!appId || !user) return
    const fetchHash = async () => {
      try {
        const res = await fetch('/api/featurebase/user-hash', {
          method: 'GET',
          cache: 'no-store',
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

    const key = `${user.id}:${userHash}`
    if (lastBootKeyRef.current === key) return

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
    lastBootKeyRef.current = key
  }, [appId, user?.id, userHash])

  if (!appId || !user) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Featurebase disabled', {
        hasAppId: !!appId,
        hasUser: !!user,
      })
    }
    return null
  }

  return (
    <Script
      src="https://do.featurebase.app/js/sdk.js"
      id="featurebase-sdk"
      strategy="afterInteractive"
      onError={() => console.warn('Featurebase SDK failed to load')}
    />
  )
}
