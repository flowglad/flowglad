'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import Input from '@/components/input'
import Button from '@/components/button'

interface LoginFormProps {
  organizationId: string
  customerExternalId: string
}

export function BillingPortalSigninForm({
  organizationId,
  customerExternalId,
}: LoginFormProps) {
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{
    email: string
    organizationId: string
    customerExternalId: string
  }>({
    defaultValues: {
      organizationId,
      customerExternalId,
      email: '',
    },
  })

  const onSubmit = async () => {
    setIsSuccess(true)
  }

  if (isSuccess) {
    return (
      <div className="text-center">
        <p className="mb-4">
          {`If there is a customer with this email, we have sent them a login link.`}
        </p>
        <p className="text-subtle">
          {`Didn't receive your email?`}
          <button
            onClick={() => setIsSuccess(false)}
            className="text-primary hover:underline cursor-pointer"
          >
            Try again
          </button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Email"
        type="email"
        error={errors.email?.message}
        {...register('email', { required: 'Email is required' })}
      />
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full"
        loading={isSubmitting}
      >
        {isSubmitting ? 'Sending...' : 'Send login link'}
      </Button>
      {errors.root && (
        <p className="text-red-500">{errors.root?.message}</p>
      )}
    </form>
  )
}
