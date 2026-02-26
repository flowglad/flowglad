'use client'

import {
  type EditFeatureInput,
  editFeatureSchema,
  type Feature,
} from '@db-core/schema/features'
import { trpc } from '@/app/_trpc/client'
import FormModal from '@/components/forms/FormModal'
import FeatureFormFields from './FeatureFormFields' // Adjusted import

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
  const getDefaultValues = (): EditFeatureInput => ({
    id: feature.id,
    feature,
  })

  return (
    <FormModal<EditFeatureInput>
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Feature"
      formSchema={editFeatureSchema}
      defaultValues={getDefaultValues}
      onSubmit={async (data) => {
        await editFeatureMutation.mutateAsync(data)
      }}
    >
      <FeatureFormFields edit />
    </FormModal>
  )
}

export default EditFeatureModal
