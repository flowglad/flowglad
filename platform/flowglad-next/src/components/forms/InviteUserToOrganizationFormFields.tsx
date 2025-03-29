import React from 'react'
import { useFormContext } from 'react-hook-form'
import Input from '@/components/ion/Input'
import { InviteUserToOrganizationInput } from '@/db/schema/memberships'

const InviteUserToOrganizationFormFields: React.FC = () => {
  const {
    register,
    formState: { errors },
  } = useFormContext<InviteUserToOrganizationInput>()
  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Email"
        type="email"
        required
        {...register('email')}
        error={errors.email?.message}
      />
      <Input
        label="Name"
        required
        {...register('name')}
        error={errors.name?.message}
      />
    </div>
  )
}

export default InviteUserToOrganizationFormFields
