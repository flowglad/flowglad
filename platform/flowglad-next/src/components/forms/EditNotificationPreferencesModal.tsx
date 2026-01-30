'use client'

import {
  type NotificationPreferences,
  notificationPreferencesSchema,
} from '@db-core/schema/memberships'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import NotificationPreferencesFormFields from './NotificationPreferencesFormFields'

const editNotificationPreferencesSchema = z.object({
  preferences: notificationPreferencesSchema.partial(),
})

type EditNotificationPreferencesInput = z.infer<
  typeof editNotificationPreferencesSchema
>

interface EditNotificationPreferencesModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  currentPreferences: NotificationPreferences
}

const EditNotificationPreferencesModal: React.FC<
  EditNotificationPreferencesModalProps
> = ({ isOpen, setIsOpen, currentPreferences }) => {
  const utils = trpc.useUtils()
  const updateNotificationPreferencesMutation =
    trpc.organizations.updateNotificationPreferences.useMutation({
      onSuccess: () => {
        utils.organizations.getNotificationPreferences.invalidate()
      },
    })

  const getDefaultValues = (): EditNotificationPreferencesInput => ({
    preferences: currentPreferences,
  })

  return (
    <FormModal<EditNotificationPreferencesInput>
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Notification Preferences"
      formSchema={editNotificationPreferencesSchema}
      defaultValues={getDefaultValues}
      onSubmit={async (data) => {
        await updateNotificationPreferencesMutation.mutateAsync(data)
      }}
    >
      <NotificationPreferencesFormFields />
    </FormModal>
  )
}

export default EditNotificationPreferencesModal
