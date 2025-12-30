'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import ErrorLabel from '@/components/ErrorLabel'
import OrganizationOnboardingFormFields from '@/components/forms/OrganizationOnboardingFormFields'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useAuthContext } from '@/contexts/authContext'
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
} from '@/db/schema/organizations'
import {
  REFERRAL_OPTIONS,
  type ReferralOption,
} from '@/utils/referrals'

const BusinessDetails = () => {
  const createOrganization = trpc.organizations.create.useMutation()
  const setReferralSelection =
    trpc.utils.setReferralSelection.useMutation()
  const { setOrganization } = useAuthContext()
  const [referralSource, setReferralSource] = useState<
    ReferralOption | undefined
  >()
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      organization: {
        name: '',
        countryId: undefined,
        stripeConnectContractType: undefined,
      },
    },
  })
  const router = useRouter()
  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const { organization } =
        await createOrganization.mutateAsync(data)

      if (referralSource) {
        try {
          await setReferralSelection.mutateAsync({
            source: referralSource,
          })
        } catch (err) {
          // Non-blocking: proceed even if referral caching fails
          console.error('Failed to cache referral selection', err)
        }
      }
      setOrganization(organization)
      router.refresh()
      router.push('/onboarding')
    } catch (error) {
      form.setError('root', { message: (error as Error).message })
    }
  })

  return (
    <div className="bg-background h-full w-full flex justify-between items-center">
      <div className="flex-1 h-full w-full flex flex-col justify-center items-center gap-9 p-20">
        <div className="w-full flex flex-col items-center gap-4">
          <Form {...form}>
            <form
              onSubmit={onSubmit}
              className="w-[380px] flex flex-col gap-6"
            >
              {/* FIXME (FG-555): Readd OrganizationLogoInput to this page once we have a way to upload the logo during organization creation */}
              <OrganizationOnboardingFormFields
                setReferralSource={setReferralSource}
                referralSource={referralSource}
              />
              <Button
                variant="default"
                size="default"
                type="submit"
                disabled={
                  form.formState.isSubmitting || !referralSource
                }
                className="w-full"
              >
                Continue
              </Button>
              {form.formState.errors.root && (
                <ErrorLabel error={form.formState.errors.root} />
              )}
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}

export default BusinessDetails
