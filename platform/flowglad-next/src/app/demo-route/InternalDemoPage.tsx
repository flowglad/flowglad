'use client'

import { Button } from '@/components/ui/button'
import { trpc } from '../_trpc/client'
import { useState } from 'react'

type RichCustomer = {
  subscription: {
    name: string
    price: string
    status: string
    nextBillingDate: string
  }
} | null

const InternalDemoPage = () => {
  const confirmCheckoutSession =
    trpc.purchases.confirmSession.useMutation()
  const [errorMessage, setErrorMessage] = useState<string | null>('')
  return (
    <Button onClick={async () => {}}>Test: {errorMessage}</Button>
  )
}

export default InternalDemoPage
