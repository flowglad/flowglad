// Generated with Ion on 11/18/2024, 2:07:04 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1303:14448
'use client'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/ion/Button'
import Input from '@/components/ion/Input'
import { trpc } from '@/app/_trpc/client'
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from '@/db/schema/organizations'
import ErrorLabel from '@/components/ErrorLabel'
import { useRouter } from 'next/navigation'
import { useAuthContext } from '@/contexts/authContext'
import { Select } from '@/components/ion/Select'

const BusinessDetails = () => {
  const createOrganization = trpc.organizations.create.useMutation()
  const { data } = trpc.countries.list.useQuery()
  const { setOrganization, user } = useAuthContext()
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      organization: {
        name: '',
      },
    },
  })
  const router = useRouter()
  const onSubmit = handleSubmit(async (data) => {
    try {
      const { organization } =
        await createOrganization.mutateAsync(data)
      setOrganization(organization)
      router.refresh()
      router.push('/onboarding')
    } catch (error) {
      setError('root', { message: (error as Error).message })
    }
  })

  const countryOptions =
    data?.countries
      .map((country) => ({
        label: country.name,
        value: country.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)) ?? []

  return (
    <div className="bg-internal h-full w-full flex justify-between items-center">
      <div className="flex-1 h-full w-full flex flex-col justify-center items-center gap-9 p-20">
        <div className="w-full flex flex-col items-center gap-4">
          <form
            onSubmit={onSubmit}
            className="w-[380px] flex flex-col gap-6"
          >
            <div className="w-full flex flex-col gap-4">
              <Input
                placeholder="Your Company"
                required
                label="What's your business name?"
                error={errors.organization?.name?.message}
                {...register('organization.name')}
                className="w-full"
              />
              <Controller
                control={control}
                name="organization.countryId"
                render={({ field: { value, onChange } }) => (
                  <Select
                    options={countryOptions}
                    value={value ?? undefined}
                    onValueChange={onChange}
                    placeholder="Select Country"
                    error={errors.organization?.countryId?.message}
                    hint="Used to determine your default currency"
                  />
                )}
              />
            </div>
            <Button
              variant="filled"
              color="primary"
              size="md"
              type="submit"
              disabled={isSubmitting}
              className="w-full"
            >
              Continue
            </Button>
            {errors.root && <ErrorLabel error={errors.root} />}
          </form>
        </div>
      </div>
    </div>
  )
}

export default BusinessDetails
