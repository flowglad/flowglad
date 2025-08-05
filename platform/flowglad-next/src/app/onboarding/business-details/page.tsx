// Generated with Ion on 11/18/2024, 2:07:04 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1303:14448
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { trpc } from '@/app/_trpc/client'
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from '@/db/schema/organizations'
import ErrorLabel from '@/components/ErrorLabel'
import { useRouter } from 'next/navigation'
import { useAuthContext } from '@/contexts/authContext'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const BusinessDetails = () => {
  const createOrganization = trpc.organizations.create.useMutation()
  const { data } = trpc.countries.list.useQuery()
  const { setOrganization, user } = useAuthContext()
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      organization: {
        name: '',
      },
    },
  })
  const router = useRouter()
  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const { organization } =
        await createOrganization.mutateAsync(data)
      setOrganization(organization)
      router.refresh()
      router.push('/onboarding')
    } catch (error) {
      form.setError('root', { message: (error as Error).message })
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
              <FormField
                control={form.control}
                name="organization.name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      What&apos;s your business name?
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your Company"
                        className="w-full"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="organization.countryId"
                render={({ field: { value, onChange } }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Select
                        value={value ?? undefined}
                        onValueChange={onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Country" />
                        </SelectTrigger>
                        <SelectContent>
                          {countryOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Used to determine your default currency
                      </FormDescription>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button
              variant="default"
              size="default"
              type="submit"
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              Continue
            </Button>
            {form.formState.errors.root && (
              <ErrorLabel error={form.formState.errors.root} />
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default BusinessDetails
