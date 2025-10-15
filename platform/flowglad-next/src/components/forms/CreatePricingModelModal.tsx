'use client'

import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PricingModelTemplateSelector } from './PricingModelTemplateSelector'
import { TemplatePreviewModal } from '@/components/pricing-model-templates/TemplatePreviewModal'
import FormModal from '@/components/forms/FormModal'
import PricingModelFormFields from '@/components/forms/PricingModelFormFields'
import { createPricingModelSchema } from '@/db/schema/pricingModels'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { generateTemplateName } from '@/utils/pricingModelTemplates'

interface CreatePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreatePricingModelModal: React.FC<
  CreatePricingModelModalProps
> = ({ isOpen, setIsOpen }) => {
  const router = useRouter()

  // Modal state management
  const [showTemplateSelector, setShowTemplateSelector] =
    useState(true)
  const [showTemplatePreview, setShowTemplatePreview] =
    useState(false)
  const [showBlankForm, setShowBlankForm] = useState(false)
  const [selectedTemplate, setSelectedTemplate] =
    useState<PricingModelTemplate | null>(null)

  // TRPC mutations
  const createPricingModelMutation =
    trpc.pricingModels.create.useMutation({
      onSuccess: ({ pricingModel }) => {
        toast.success('Pricing model created successfully')
        setIsOpen(false)
        router.push(`/store/pricing-models/${pricingModel.id}`)
        resetState()
      },
      onError: (error) => {
        toast.error('Failed to create pricing model')
        console.error(error)
      },
    })

  const setupPricingModelMutation =
    trpc.pricingModels.setup.useMutation({
      onSuccess: ({ pricingModel }) => {
        toast.success(
          'Pricing model created from template successfully'
        )
        setIsOpen(false)
        router.push(`/store/pricing-models/${pricingModel.id}`)
        resetState()
      },
      onError: (error) => {
        toast.error('Failed to create pricing model from template')
        console.error(error)
      },
    })

  const resetState = () => {
    setShowTemplateSelector(true)
    setShowTemplatePreview(false)
    setShowBlankForm(false)
    setSelectedTemplate(null)
  }

  const handleTemplateSelect = (template: PricingModelTemplate) => {
    setSelectedTemplate(template)
    setShowTemplateSelector(false)
    setShowTemplatePreview(true)
  }

  const handleCreateBlank = () => {
    setShowTemplateSelector(false)
    setShowBlankForm(true)
  }

  const handleConfirmTemplate = async () => {
    if (!selectedTemplate) return

    // Modify template name to be unique for this user
    const customizedInput = {
      ...selectedTemplate.input,
      name: generateTemplateName(selectedTemplate.input.name),
    }

    await setupPricingModelMutation.mutateAsync(customizedInput)
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    resetState()
  }

  return (
    <>
      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <PricingModelTemplateSelector
          isOpen={isOpen && showTemplateSelector}
          setIsOpen={handleCloseModal}
          onTemplateSelect={handleTemplateSelect}
          onCreateBlank={handleCreateBlank}
        />
      )}

      {/* Template Preview Modal */}
      {showTemplatePreview && selectedTemplate && (
        <TemplatePreviewModal
          isOpen={showTemplatePreview}
          setIsOpen={(open) => {
            if (!open) {
              setShowTemplatePreview(false)
              setShowTemplateSelector(true)
              setSelectedTemplate(null)
            }
          }}
          template={selectedTemplate}
          onConfirm={handleConfirmTemplate}
          isCreating={setupPricingModelMutation.isPending}
        />
      )}

      {/* Blank Pricing Model Form (existing behavior) */}
      {showBlankForm && (
        <FormModal
          isOpen={isOpen && showBlankForm}
          setIsOpen={(open) => {
            if (!open) {
              handleCloseModal()
            } else {
              setShowBlankForm(true)
            }
          }}
          title="Create Pricing Model"
          formSchema={createPricingModelSchema}
          defaultValues={{ pricingModel: { name: '' } }}
          onSubmit={createPricingModelMutation.mutateAsync}
        >
          <PricingModelFormFields />
        </FormModal>
      )}
    </>
  )
}

export default CreatePricingModelModal
