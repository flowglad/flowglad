'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { trpc } from '@/app/_trpc/client'
import { updateFocusedMembershipSchema } from '@/db/schema/organizations'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorLabel from '@/components/ErrorLabel'
import { RadioGroup, RadioGroupItem } from '@/components/ion/Radio'

type FormValues = z.infer<typeof updateFocusedMembershipSchema>

const SelectOrganizationPage = () => {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    data: focusedMembership,
    isLoading: isLoadingFocusedMembership,
  } = trpc.organizations.getFocusedMembership.useQuery()

  const { data: organizations, isLoading: isLoadingOrganizations } =
    trpc.organizations.getOrganizations.useQuery()

  const updateFocusedMembershipMutation =
    trpc.organizations.updateFocusedMembership.useMutation({
      onSuccess: () => {
        router.push('/dashboard')
      },
    })

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateFocusedMembershipSchema),
    defaultValues: {
      organizationId:
        focusedMembership?.membership.organizationId || '',
    },
  })
  const focusedMembershipOrganizationId =
    focusedMembership?.membership.organizationId
  useEffect(() => {
    if (focusedMembershipOrganizationId) {
      setValue('organizationId', focusedMembershipOrganizationId)
    }
  }, [focusedMembershipOrganizationId, setValue])

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true)
    try {
      await updateFocusedMembershipMutation.mutateAsync(data)
    } catch (error) {
      console.error('Error updating focused membership:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedOrganizationId = watch('organizationId')

  // Sort organizations alphabetically by name
  const sortedOrganizations =
    organizations?.sort((a, b) => a.name.localeCompare(b.name)) || []

  if (isLoadingOrganizations || isLoadingFocusedMembership) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">
              Select Organization
            </h1>
            <p className="text-gray-600 mt-1">
              Choose which organization you want to work with
            </p>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-10">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            Select Organization
          </h1>
          <p className="text-gray-600 mt-1">
            Choose which organization you want to work with
          </p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-3">
            <Controller
              control={control}
              name="organizationId"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-col gap-2"
                >
                  {sortedOrganizations.map((org) => (
                    <div
                      key={org.id}
                      className="flex items-center gap-2"
                    >
                      <RadioGroupItem
                        value={org.id}
                        label={org.name}
                        id={org.id}
                      />
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
          </div>

          {errors.organizationId && (
            <ErrorLabel error={errors.organizationId} />
          )}

          <div className="mt-6">
            <Button
              type="submit"
              disabled={isSubmitting || !selectedOrganizationId}
              className="w-full"
              loading={isSubmitting}
            >
              {isSubmitting ? 'Switching...' : 'Switch Organization'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SelectOrganizationPage
