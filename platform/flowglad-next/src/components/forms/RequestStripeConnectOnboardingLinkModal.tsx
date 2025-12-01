'use client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { trpc } from '@/app/_trpc/client'
import {
  Country,
  requestStripeConnectOnboardingLinkInputSchema,
} from '@/db/schema/countries'
import RequestStripeConnectOnboardingLinkFormFields from '@/components/forms/RequestStripeConnectOnboardingLinkFormFields'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import ErrorLabel from '@/components/ErrorLabel'

const RequestStripeConnectOnboardingLinkModal = ({
  isOpen,
  setIsOpen,
  countries,
}: {
  isOpen: boolean
  countries: Country.Record[]
  setIsOpen: (isOpen: boolean) => void
}) => {
  const requestStripeConnectOnboardingLink =
    trpc.organizations.requestStripeConnect.useMutation()

  const form = useForm<
    z.infer<typeof requestStripeConnectOnboardingLinkInputSchema>
  >({
    resolver: zodResolver(
      requestStripeConnectOnboardingLinkInputSchema
    ),
    defaultValues: {
      CountryId: countries.find(
        (country) => country.name === 'United States'
      )?.id!,
    },
  })

  const onSubmit = async (
    data: z.infer<
      typeof requestStripeConnectOnboardingLinkInputSchema
    >
  ) => {
    try {
      const { onboardingLink } =
        await requestStripeConnectOnboardingLink.mutateAsync(data)
      // Redirect to Stripe
      window.location.href = onboardingLink
    } catch (error) {
      form.setError('root', {
        message: (error as Error).message,
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up Stripe</DialogTitle>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="flex flex-col gap-6">
              <RequestStripeConnectOnboardingLinkFormFields
                countries={countries}
              />
            </div>
            <div className="text-left">
              <ErrorLabel error={form.formState.errors.root} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  form.reset()
                  setIsOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                Continue to Stripe
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

export default RequestStripeConnectOnboardingLinkModal
