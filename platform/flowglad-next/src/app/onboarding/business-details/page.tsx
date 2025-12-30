'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import ErrorLabel from '@/components/ErrorLabel'
import OrganizationFormFields from '@/components/forms/OrganizationFormFields'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useAuthContext } from '@/contexts/authContext'
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
} from '@/db/schema/organizations'
import core from '@/utils/core'
import { type ReferralOption } from '@/utils/referrals'

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Something went wrong.'
}

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
      codebaseMarkdown: '',
    },
  })
  const router = useRouter()
  const selectedCountryId = form.watch('organization.countryId')
  const selectedStripeConnectContractType = form.watch(
    'organization.stripeConnectContractType'
  )
  const onSubmit = form.handleSubmit(async (data) => {
    try {
      if (
        !core.IS_PROD &&
        !data.organization.stripeConnectContractType
      ) {
        form.setError('organization.stripeConnectContractType', {
          message: 'Select a payment processing option.',
        })
        return
      }

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
      form.setError('root', { message: errorMessage(error) })
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
              <OrganizationFormFields
                setReferralSource={setReferralSource}
                referralSource={referralSource}
              />
              <Button
                variant="default"
                size="default"
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  !referralSource ||
                  !selectedCountryId ||
                  (!core.IS_PROD &&
                    !selectedStripeConnectContractType)
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
