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
      redirect('/sign-in')
    }
    performLogout()
  })
  return null
}
