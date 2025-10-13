'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { trpc } from '@/app/_trpc/client'

function isValidRedirectUrl(url: string): boolean {
  try {
    return (
      url.startsWith('/billing-portal/org_') && !url.includes('..')
    )
  } catch {
    return false
  }
}

export default function Logout() {
  const logoutMutation = trpc.utils.logout.useMutation()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const performLogout = async () => {
      await logoutMutation.mutateAsync()
      const redirectParam = searchParams.get('redirect')
      if (redirectParam && isValidRedirectUrl(redirectParam)) {
        router.replace(redirectParam)
      } else {
        router.replace('/sign-in')
      }
    }
    performLogout()
  }, [searchParams, logoutMutation, router])
  return null
}
