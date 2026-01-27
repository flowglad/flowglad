'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { trpc } from '@/app/_trpc/client'
import ErrorLabel from '@/components/ErrorLabel'
import { FixedNavigationBar } from '@/components/onboarding/FixedNavigationBar'
import {
  MultiStepForm,
  useMultiStepForm,
} from '@/components/onboarding/MultiStepForm'
import { useAuthContext } from '@/contexts/authContext'
import core from '@/utils/core'
import { CodebaseAnalysisStep } from './steps/CodebaseAnalysisStep'
import { CountryStep } from './steps/CountryStep'
import { OrganizationNameStep } from './steps/OrganizationNameStep'
import { PaymentProcessingStep } from './steps/PaymentProcessingStep'
import { ReferralStep } from './steps/ReferralStep'
import {
  type BusinessDetailsFormData,
  businessDetailsFormSchema,
  codebaseAnalysisStepSchema,
  countryStepSchema,
  organizationNameStepSchema,
  paymentProcessingStepSchema,
  referralStepSchema,
} from './steps/schemas'

const steps = [
  {
    id: 'organization-name',
    title: 'Organization Name',
    schema: organizationNameStepSchema,
    component: OrganizationNameStep,
  },
  {
    id: 'country',
    title: 'Country',
    schema: countryStepSchema,
    component: CountryStep,
  },
  {
    id: 'payment-processing',
    title: 'Payment Processing',
    schema: paymentProcessingStepSchema,
    component: PaymentProcessingStep,
    // Only show in non-production environments
    // Server defaults to Platform in production (see organizationHelpers.ts)
    shouldSkip: () => core.IS_PROD,
  },
  {
    id: 'codebase-analysis',
    title: 'Codebase Analysis',
    schema: codebaseAnalysisStepSchema,
    component: CodebaseAnalysisStep,
  },
  {
    id: 'referral',
    title: 'Referral Source',
    schema: referralStepSchema,
    component: ReferralStep,
  },
]

/**
 * Wrapper component to ensure Suspense boundary for useSearchParams.
 * In Next.js 15, useSearchParams() must be wrapped in Suspense to prevent
 * hydration issues that can cause context providers to be unavailable.
 */
export default function BusinessDetailsPage() {
  return (
    <Suspense fallback={<BusinessDetailsLoadingFallback />}>
      <BusinessDetailsContent />
    </Suspense>
  )
}

function BusinessDetailsLoadingFallback() {
  return (
    <div className="min-h-screen relative grid place-items-center">
      {/* Full-height dashed borders (visual layer) */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[608px] -translate-x-1/2 px-4">
        <div className="h-full w-full border-l border-r border-dashed border-border">
          <div className="h-full w-full px-4">
            <div className="h-full w-full border-l border-r border-dashed border-border" />
          </div>
        </div>
      </div>

      {/* Content layer - natural height */}
      <div className="w-full max-w-[608px]">
        <div className="w-full px-4 border-l border-r border-dashed border-transparent">
          <div className="w-full px-4 border-l border-r border-dashed border-transparent">
            <div className="flex flex-col justify-center py-8">
              {/* Empty placeholder matching the layout structure */}
            </div>
            {/* Bottom bar placeholder with full-bleed border */}
            <div className="w-full relative bg-background before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-screen before:border-t before:border-border" />
          </div>
        </div>
      </div>
    </div>
  )
}

function BusinessDetailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createOrganization = trpc.organizations.create.useMutation()
  const setReferralSelection =
    trpc.utils.setReferralSelection.useMutation()
  const { setOrganization } = useAuthContext()

  // URL-based step routing: read step from ?step=N parameter
  // Note: parseInt returns NaN for invalid strings, and Math.max(0, NaN) is NaN,
  // so we use || 0 to fall back to 0 for any non-numeric input
  const stepFromUrl = Math.max(
    0,
    Number.parseInt(searchParams.get('step') ?? '0', 10) || 0
  )

  // Update URL when step changes (enables browser back/forward)
  const handleStepChange = (newStepIndex: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('step', newStepIndex.toString())
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // Handle form completion
  const handleComplete = async (data: BusinessDetailsFormData) => {
    const { organization } = await createOrganization.mutateAsync({
      organization: data.organization,
      codebaseMarkdown: data.codebaseMarkdown,
    })

    // Non-critical: referral tracking (don't block on failure)
    if (data.referralSource) {
      try {
        await setReferralSelection.mutateAsync({
          source: data.referralSource,
        })
      } catch (err) {
        // Log but don't surface to user - referral is non-critical
        console.error('Failed to cache referral selection', err)
      }
    }

    setOrganization(organization)

    // Clear draft data on success
    localStorage.removeItem('onboarding-draft')

    router.refresh()
    router.push('/onboarding')
  }

  return (
    <MultiStepForm
      schema={businessDetailsFormSchema}
      defaultValues={{
        organization: {
          name: '',
          countryId: 'country_us',
          stripeConnectContractType: undefined,
        },
        codebaseMarkdown: '',
        referralSource: undefined,
      }}
      steps={steps}
      onComplete={handleComplete}
      persistKey="onboarding-draft"
      initialStep={stepFromUrl}
      onStepChange={handleStepChange}
      analyticsPrefix="onboarding_business_details"
    >
      <div className="min-h-screen relative grid place-items-center">
        {/* Full-height dashed borders (visual layer) */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[608px] -translate-x-1/2 px-4">
          <div className="h-full w-full border-l border-r border-dashed border-border">
            <div className="h-full w-full px-4">
              <div className="h-full w-full border-l border-r border-dashed border-border" />
            </div>
          </div>
        </div>

        {/* Content layer - natural height */}
        <div className="w-full max-w-[608px]">
          <div className="w-full px-4 border-l border-r border-dashed border-transparent">
            <div className="w-full px-4 border-l border-r border-dashed border-transparent">
              <div className="flex flex-col justify-center py-8">
                <FormContent />
              </div>

              {/* Full-width bottom bar - flows with content, not fixed */}
              {/* showBorders={false} because parent containers provide the dashed borders */}
              <FixedNavigationBar
                hideBackOnFirstStep
                showProgress
                fixed={false}
                showBorders={false}
              />
            </div>
          </div>
        </div>
      </div>
    </MultiStepForm>
  )
}

// Separate component to access form context
function FormContent() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()

  return (
    <>
      <StepRenderer />

      {/* Display root-level errors */}
      {form.formState.errors.root && (
        <div className="mt-4">
          <ErrorLabel error={form.formState.errors.root} />
        </div>
      )}
    </>
  )
}

// StepRenderer uses context to get the FILTERED currentStep
function StepRenderer() {
  const { currentStep } = useMultiStepForm()

  if (!currentStep?.component) return null

  const CurrentStepComponent = currentStep.component
  return <CurrentStepComponent />
}
