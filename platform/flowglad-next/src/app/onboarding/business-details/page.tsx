'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import ErrorLabel from '@/components/ErrorLabel'
import {
  MultiStepForm,
  useMultiStepForm,
} from '@/components/onboarding/MultiStepForm'
import { StepProgress } from '@/components/onboarding/StepProgress'
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred. Please try again.'
}

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

export default function BusinessDetailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createOrganization = trpc.organizations.create.useMutation()
  const setReferralSelection =
    trpc.utils.setReferralSelection.useMutation()
  const { setOrganization } = useAuthContext()

  // URL-based step routing: read step from ?step=N parameter
  const stepFromUrl = Math.max(
    0,
    Number.parseInt(searchParams.get('step') ?? '0', 10)
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <MultiStepForm
          schema={businessDetailsFormSchema}
          defaultValues={{
            organization: {
              name: '',
              countryId: undefined,
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
          <FormContent />
        </MultiStepForm>
      </div>
    </div>
  )
}

// Separate component to access form context
function FormContent() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()

  return (
    <>
      <div className="mb-8">
        <StepProgress variant="dots" />
      </div>

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
