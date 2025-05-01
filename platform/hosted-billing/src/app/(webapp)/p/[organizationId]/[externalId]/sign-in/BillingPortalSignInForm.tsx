'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import Input from '@/components/input'
import Button from '@/components/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/card'
import {
  requestMagicLinkSchema,
  type RequestMagicLinkBody,
} from '@/apiSchemas'
import { zodResolver } from '@hookform/resolvers/zod'
interface LoginFormProps {
  organizationId: string
  customerExternalId: string
  livemode: boolean
}

export function BillingPortalSigninForm({
  organizationId,
  customerExternalId,
  livemode,
}: LoginFormProps) {
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RequestMagicLinkBody>({
    resolver: zodResolver(requestMagicLinkSchema),
    defaultValues: {
      organizationId,
      customerExternalId,
      customerEmail: '',
      livemode,
    },
  })

  const requestMagicLinkMutation = useMutation({
    mutationFn: async (data: RequestMagicLinkBody) => {
      const response = await axios.post(
        `/api/${organizationId}/${customerExternalId}/request-magic-link`,
        data
      )
      return response.data
    },
  })

  const onSubmit = async (data: RequestMagicLinkBody) => {
    try {
      await requestMagicLinkMutation.mutateAsync(data)
      setIsSuccess(true)
    } catch {
      setError('root', {
        message: 'Failed to send login link. Please try again.',
      })
    }
  }

  const content = isSuccess ? (
    <div className="text-center space-y-6">
      <p className="text-lg font-medium leading-relaxed">
        If there is a customer with this email,
        <br />
        they will receive a login link
      </p>
      <p className="text-muted-foreground text-sm">
        Didn&apos;t receive your email?{' '}
        <button
          onClick={() => setIsSuccess(false)}
          className="text-primary hover:border-b hover:border-dotted border-primary cursor-pointer transition-all"
        >
          Try again
        </button>
      </p>
    </div>
  ) : (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Input
        label="Email"
        type="email"
        error={errors.customerEmail?.message}
        {...register('customerEmail', {
          required: 'Email is required',
        })}
      />
      <Button
        type="submit"
        disabled={isSubmitting || requestMagicLinkMutation.isPending}
        className="w-full"
        loading={isSubmitting || requestMagicLinkMutation.isPending}
      >
        {isSubmitting || requestMagicLinkMutation.isPending
          ? 'Sending...'
          : 'Send login link'}
      </Button>
      {errors.root && (
        <p className="text-destructive text-sm">
          {errors.root?.message}
        </p>
      )}
    </form>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-[420px]">
        {!isSuccess && (
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Log in to manage your billing
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Enter your email and we will send you a link directly to
              your customer portal.
            </CardDescription>
          </CardHeader>
        )}
        <CardContent>{content}</CardContent>
      </Card>
    </div>
  )
}
