'use client'

import FormModal from '@/components/forms/FormModal'
import { createUsageMeterSchema } from '@/db/schema/usageMeters'
import UsageMeterFormFields from '@/components/forms/UsageMeterFormFields'
import { trpc } from '@/app/_trpc/client'
import { UsageMeterAggregationType } from '@/types'

interface CreateUsageMeterModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreateUsageMeterModal: React.FC<CreateUsageMeterModalProps> = ({
  isOpen,
  setIsOpen,
}) => {
  const createUsageMeter = trpc.usageMeters.create.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Usage Meter"
      formSchema={createUsageMeterSchema}
      defaultValues={{
        usageMeter: {
          aggregationType: UsageMeterAggregationType.Sum,
        },
      }}
      onSubmit={createUsageMeter.mutateAsync}
    >
      <UsageMeterFormFields />
    </FormModal>
  )
}

export default CreateUsageMeterModal
