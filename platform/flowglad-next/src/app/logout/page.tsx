'use client'
import { authClient } from '@/utils/authClient'
import { redirect } from 'next/navigation'
import { useEffect } from 'react'
import { trpc } from '@/app/_trpc/client'

export default function Logout() {
  const logoutMutation = trpc.utils.logout.useMutation()
  
  useEffect(() => {
    const performLogout = async () => {
      await logoutMutation.mutateAsync()
      await authClient.signOut()
      redirect('/sign-in')
    }
    performLogout()
  }, [logoutMutation])
  return null
}
