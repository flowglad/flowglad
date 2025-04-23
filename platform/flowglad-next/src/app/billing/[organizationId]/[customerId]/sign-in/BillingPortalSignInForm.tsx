'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import { RequestBillingPortalLinkInput } from '@/db/schema/customers'
import Input from '@/components/ion/Input'
import Button from '@/components/ion/Button'

interface LoginFormProps {
  organizationId: string
  customerId: string
}

export function BillingPortalSigninForm({
  organizationId,
  customerId,
}): React.FC<LoginFormProps> {
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestBillingPortalLinkInput>({
    defaultValues: {
      organizationId,
      customerId,
      email: '',
    },
  })

  const requestPortalLink =
    trpc.utils.requestBillingPortalLink.useMutation({})

  const loading = requestPortalLink.isPending
  const onSubmit = async (data: RequestBillingPortalLinkInput) => {
    await requestPortalLink.mutateAsync(data)
    setIsSuccess(true)
  }

  if (isSuccess) {
    return (
      <div className="text-center">
        <p className="mb-4">
          If there is a customer with this email, we have sent them a
          login link.
        </p>
        <p className="text-subtle">
          Didn't receive your email?{' '}
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
        disabled={loading}
        className="w-full"
        loading={loading}
      >
        {loading ? 'Sending...' : 'Send login link'}
      </Button>
      {errors.root && (
        <p className="text-red-500">{errors.root?.message}</p>
      )}
    </form>
  )
}
