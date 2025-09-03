'use client'

import FormModal from '@/components/forms/FormModal'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import {
  Customer,
  editCustomerInputSchema,
} from '@/db/schema/customers'
import { z } from 'zod'

interface ArchiveCustomerModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customerId: string
  customerArchived: boolean
}

const ArchiveCustomerModal: React.FC<ArchiveCustomerModalProps> = ({
  isOpen,
  setIsOpen,
  customerId,
  customerArchived,
}) => {
  const router = useRouter()
  const editCustomer = trpc.customers.edit.useMutation()

  const handleSubmit = async (data: Customer.EditInput) => {
    await editCustomer.mutateAsync(data)
    router.refresh()
  }

  const formSchema = z.object({
    customer: z.object({
      id: z.string(),
      archived: z.boolean(),
    }),
  })

  const defaultValues = {
    customer: {
      id: customerId,
      archived: !customerArchived,
    },
  }

  const modalText = !customerArchived ? (
    <div className="text-muted-foreground gap-4">
      <p className="text-muted-foreground pb-4">
        Archiving will hide this customer from active lists.
      </p>
      <p className="text-muted-foreground pb-4">
        You can unarchive them later.
      </p>
      <p className="text-muted-foreground pb-4">
        Would you like to archive this customer?
      </p>
    </div>
  ) : (
    <div className="text-muted-foreground gap-4">
      <p className="text-muted-foreground pb-4">
        Unarchiving will make this customer active again.
      </p>
      <p className="text-muted-foreground pb-4">
        It will not take any billing actions or notify them.
      </p>
      <p className="text-muted-foreground pb-4">
        Would you like to unarchive this customer?
      </p>
    </div>
  )

  return (
    <FormModal
      title={
        !customerArchived ? 'Archive customer' : 'Unarchive customer'
      }
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onSubmit={handleSubmit}
      formSchema={editCustomerInputSchema}
      defaultValues={defaultValues}
    >
      {modalText}
    </FormModal>
  )
}

export default ArchiveCustomerModal
