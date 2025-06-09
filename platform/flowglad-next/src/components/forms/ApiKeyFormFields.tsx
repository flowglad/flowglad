'use client'

import { useFormContext } from 'react-hook-form'
import { CreateApiKeyInput } from '@/db/schema/apiKeys'
import Input from '@/components/ion/Input'

const ApiKeyFormFields = () => {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateApiKeyInput>()
  return (
    <div className="flex flex-col gap-4">
      <Input
        {...register('apiKey.name')}
        label="Name"
        placeholder="e.g. Production API Key"
        error={errors.apiKey?.name?.message}
      />
    </div>
  )
}

export default ApiKeyFormFields
