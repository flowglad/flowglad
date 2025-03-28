'use client'

import FormModal from '@/components/forms/FormModal'
import {
  UsageMeter,
  editUsageMeterSchema,
} from '@/db/schema/usageMeters'
import UsageMeterFormFields from '@/components/forms/UsageMeterFormFields'
import { trpc } from '@/app/_trpc/client'

interface EditUsageMeterModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  usageMeter: UsageMeter.ClientRecord
}

const EditUsageMeterModal: React.FC<EditUsageMeterModalProps> = ({
  isOpen,
  setIsOpen,
  usageMeter,
}) => {
  const editUsageMeter = trpc.usageMeters.update.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Usage Meter"
      formSchema={editUsageMeterSchema}
      defaultValues={{ usageMeter }}
      onSubmit={editUsageMeter.mutateAsync}
    >
      <UsageMeterFormFields />
    </FormModal>
  )
}

export default EditUsageMeterModal
