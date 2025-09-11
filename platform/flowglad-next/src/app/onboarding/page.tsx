'use client'

import { trpc } from '@/app/_trpc/client'
import { OnboardingChecklistItem, OnboardingItemType } from '@/types'
import OnboardingStatusTable from './OnboardingStatusTable'
import { ClientAuthGuard } from '@/components/ClientAuthGuard'
import { useAuthContext } from '@/contexts/authContext'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const OnboardingPage = () => {
  const { organization } = useAuthContext()
  const router = useRouter()

  // Client-side queries using tRPC
  const { data: countries, isLoading: countriesLoading } =
    trpc.countries.list.useQuery()

  // Redirect to business details if no organization
  useEffect(() => {
    if (!organization) {
      router.push('/onboarding/business-details')
    }
  }, [organization, router])

  // Show loading state while data is being fetched
  if (!organization || countriesLoading || !countries) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full justify-center items-start m-auto max-w-[416px] min-h-svh">
        <div className="flex flex-col items-start justify-center w-full gap-4">
          <div className="flex flex-col items-start justify-center gap-1 p-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const onboardingChecklistItems: OnboardingChecklistItem[] = [
    {
      title: 'Setup payments',
      description:
        'Verify identity and connect your bank to receive payments.',
      completed: organization.payoutsEnabled,
      action: 'Setup',
      type: OnboardingItemType.Stripe,
    },
  ]

  // Generate a realistic placeholder API key for demo purposes
  // In production, this should be replaced with proper API key management
  const placeholderApiKey = `sk_test_${organization.id.slice(0, 8)}...${Math.random().toString(36).slice(2, 10)}`

  return (
    <ClientAuthGuard
      requireAuth={true}
      requireOrganization={true}
      redirectTo="/onboarding/business-details"
    >
      <div className="flex flex-col gap-4 p-4 w-full justify-center items-start m-auto max-w-[416px] min-h-svh">
        <div className="flex flex-col items-start justify-center w-full gap-4">
          <div className="flex flex-col items-start justify-center gap-1 p-2">
            <h2 className="text-xl font-semibold">
              Integrate Flowglad
            </h2>
            <p className="text-sm text-foreground">
              Complete just a few steps to get up and running.
            </p>
          </div>
          <OnboardingStatusTable
            onboardingChecklistItems={onboardingChecklistItems}
            countries={countries.countries}
            secretApiKey={placeholderApiKey}
          />
        </div>
      </div>
    </ClientAuthGuard>
  )
}

export default OnboardingPage
