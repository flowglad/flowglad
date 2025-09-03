'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { use } from 'react'

interface BillingPortalRedirectPageProps {
  params: Promise<{
    organizationId: string
  }>
}

const BillingPortalRedirectPage = ({
  params,
}: BillingPortalRedirectPageProps) => {
  const router = useRouter()
  const { organizationId } = use(params)

  useEffect(() => {
    // Redirect to customer selection page
    router.push(`/billing-portal/${organizationId}/select-customer`)
  }, [organizationId, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  )
}

export default BillingPortalRedirectPage
