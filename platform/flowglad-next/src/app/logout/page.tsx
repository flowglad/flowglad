'use client'
import { authClient } from '@/utils/authClient'
import { redirect } from 'next/navigation'
import { useEffect } from 'react'

export default function Logout() {
  useEffect(() => {
    authClient.signOut()
    redirect('/sign-in')
  }, [])
  return null
}
