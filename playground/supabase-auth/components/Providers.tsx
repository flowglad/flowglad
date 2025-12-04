'use client'

import { FlowgladProvider } from '@flowglad/nextjs'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'

interface ProvidersProps {
  children: React.ReactNode
  baseURL?: string
  requestConfig?: {
    headers?: Record<string, string>
  }
}

export const Providers = ({
  children,
  baseURL,
  requestConfig,
}: ProvidersProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      setUser(currentUser)
      setLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <>{children}</>
  }

  return (
    <FlowgladProvider
      loadBilling={!!user}
      baseURL={baseURL}
      requestConfig={requestConfig}
    >
      {children}
    </FlowgladProvider>
  )
}
