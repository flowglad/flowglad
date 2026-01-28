'use client'

import { z } from 'zod'
import FormModal from '@/components/forms/FormModal'

const removeMemberFormSchema = z.object({
  membershipId: z.string(),
})

export interface RemoveMemberModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  membershipId: string
  memberName: string
  memberEmail: string
  /**
   * Whether the current user is removing themselves (leaving) vs an owner removing someone else
   */
  isLeaving: boolean
  onConfirm: (membershipId: string) => Promise<void>
}

const RemoveMemberModal: React.FC<RemoveMemberModalProps> = ({
  isOpen,
  setIsOpen,
  membershipId,
  memberName,
  memberEmail,
  isLeaving,
  onConfirm,
}) => {
  const displayName = memberName || memberEmail

  return (
    <FormModal
      title={isLeaving ? 'Leave Organization' : 'Remove Member'}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onSubmit={async () => {
        await onConfirm(membershipId)
      }}
      formSchema={removeMemberFormSchema}
      defaultValues={{ membershipId }}
      submitButtonText={isLeaving ? 'Leave' : 'Remove'}
    >
      <div className="text-muted-foreground gap-4">
        {isLeaving ? (
          <>
            <p className="pb-4">
              Are you sure you want to leave this organization?
            </p>
            <p className="pb-4">
              You will lose access to all organization data. To regain
              access, you will need to be invited again by an
              organization owner.
            </p>
          </>
        ) : (
          <>
            <p className="pb-4">
              Are you sure you want to remove{' '}
              <span className="font-medium text-foreground">
                {displayName}
              </span>{' '}
              from this organization?
            </p>
            <p className="pb-4">
              They will lose access to all organization data. You can
              re-invite them later if needed.
            </p>
          </>
        )}
      </div>
    </FormModal>
  )
}

export default RemoveMemberModal
