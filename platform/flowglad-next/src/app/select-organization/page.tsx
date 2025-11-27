'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import ErrorLabel from '@/components/ErrorLabel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { updateFocusedMembershipSchema } from '@/db/schema/organizations'

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
      <div className="w-full min-h-[100dvh] grid place-items-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
              Select Organization
            </CardTitle>
            <CardDescription>
              Choose which organization you want to work with
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full min-h-[100dvh] grid place-items-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">
            Select Organization
          </CardTitle>
          <CardDescription>
            Choose which organization you want to work with
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
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
                        className="flex items-center gap-3"
                      >
                        <RadioGroupItem value={org.id} id={org.id} />
                        <Label htmlFor={org.id}>{org.name}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              />
            </div>

            {errors.organizationId && (
              <ErrorLabel error={errors.organizationId} />
            )}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={isSubmitting || !selectedOrganizationId}
            className="w-full"
            onClick={handleSubmit(onSubmit)}
          >
            {isSubmitting && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {isSubmitting ? 'Switching...' : 'Switch Organization'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default SelectOrganizationPage
