import { idInputSchema } from '@db-core/tableUtils'
import { sentenceCase } from 'change-case'
import type { UseFormReturn } from 'react-hook-form'
import type { trpc } from '@/app/_trpc/client'
import FormModal, {
  NestedFormModal,
} from '@/components/forms/FormModal'

export type LocalDeleteMutation = (params: {
  id: string
}) => Promise<void>

export type ServerMutation = ReturnType<
  typeof trpc.discounts.delete.useMutation
>['mutateAsync']

export interface DeleteModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  id: string
  mutation: ServerMutation | LocalDeleteMutation
  form?: UseFormReturn
  noun: string
  nested?: boolean
}

export type DeleteModalWrapperProps = Omit<
  DeleteModalProps,
  'noun' | 'mutation'
>

const DeleteModal: React.FC<DeleteModalProps> = ({
  isOpen,
  setIsOpen,
  id,
  mutation,
  noun,
  nested,
  form,
}) => {
  const getDefaultValues = () => ({
    id,
  })
  const ModalComponent = nested ? NestedFormModal : FormModal
  return (
    <ModalComponent
      title={`Delete ${sentenceCase(noun)}`}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onSubmit={() => mutation({ id })}
      formSchema={idInputSchema}
      defaultValues={getDefaultValues}
      form={form ?? undefined}
    >
      <div className="text-muted-foreground gap-4">
        <p className="text-muted-foreground pb-4">
          {`Are you sure you want to delete this ${noun}?`}
        </p>
        <p className="text-muted-foreground pb-4">
          This action cannot be undone.
        </p>
      </div>
    </ModalComponent>
  )
}

export default DeleteModal
