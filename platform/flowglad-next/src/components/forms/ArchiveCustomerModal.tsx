'use client'

import FormModal from '@/components/forms/FormModal'
import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import {
  CustomerProfile,
  editCustomerProfileInputSchema,
} from '@/db/schema/customerProfiles'
import { z } from 'zod'

interface ArchiveCustomerModalProps {
  trigger?: React.ReactNode
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customerProfileId: string
  customerArchived: boolean
}

const ArchiveCustomerModal: React.FC<ArchiveCustomerModalProps> = ({
  isOpen,
  setIsOpen,
  customerProfileId,
  customerArchived,
}) => {
  const router = useRouter()
  const editCustomerProfile = trpc.customerProfiles.edit.useMutation()

  const handleSubmit = async (data: CustomerProfile.EditInput) => {
    await editCustomerProfile.mutateAsync(data)
    router.refresh()
  }

  const formSchema = z.object({
    customerProfile: z.object({
      id: z.string(),
      archived: z.boolean(),
    }),
  })

  const defaultValues = {
    customerProfile: {
      id: customerProfileId,
      archived: !customerArchived,
    },
  }

  const modalText = !customerArchived ? (
    <div className="text-secondary gap-4">
      <p className="text-secondary pb-4">
        Archiving will hide this customer from active lists.
      </p>
      <p className="text-secondary pb-4">
        You can unarchive them later.
      </p>
      <p className="text-secondary pb-4">
        Would you like to archive this customer?
      </p>
    </div>
  ) : (
    <div className="text-secondary gap-4">
      <p className="text-secondary pb-4">
        Unarchiving will make this customer active again.
      </p>
      <p className="text-secondary pb-4">
        It will not take any billing actions or notify them.
      </p>
      <p className="text-secondary pb-4">
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
      formSchema={editCustomerProfileInputSchema}
      defaultValues={defaultValues}
    >
      {modalText}
    </FormModal>
  )
}

export default ArchiveCustomerModal
