'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { trpc } from '@/app/_trpc/client'

export default function Logout() {
  const logoutMutation = trpc.utils.logout.useMutation()
  const router = useRouter()
  useEffect(() => {
    const performLogout = async () => {
      await logoutMutation.mutateAsync()
      router.replace('/sign-in')
    }
    performLogout()
  }, [logoutMutation])
  return null
}
