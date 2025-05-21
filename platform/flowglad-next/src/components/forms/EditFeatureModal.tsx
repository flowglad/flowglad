'use client'

import FormModal from '@/components/forms/FormModal'
import {
  Feature,
  EditFeatureInput,
  editFeatureSchema,
} from '@/db/schema/features'
import FeatureFormFields from './FeatureFormFields' // Adjusted import
import { trpc } from '@/app/_trpc/client'

interface EditFeatureModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  feature: Feature.ClientRecord // Adjusted type
}

const EditFeatureModal: React.FC<EditFeatureModalProps> = ({
  isOpen,
  setIsOpen,
  feature,
}) => {
  const editFeatureMutation = trpc.features.update.useMutation() // Adjusted endpoint

  // Prepare defaultValues according to the schema structure
  const defaultValues: EditFeatureInput = {
    id: feature.id,
    feature,
  }

  return (
    <FormModal<EditFeatureInput>
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Feature"
      formSchema={editFeatureSchema}
      defaultValues={defaultValues}
      onSubmit={async (data) => {
        await editFeatureMutation.mutateAsync(data)
      }}
    >
      <FeatureFormFields />
    </FormModal>
  )
}

export default EditFeatureModal
