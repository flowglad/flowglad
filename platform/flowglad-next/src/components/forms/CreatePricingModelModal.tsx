'use client'

import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { TemplateSelectorContent } from './TemplateSelectorContent'
import { TemplatePreviewContent } from '@/components/pricing-model-templates/TemplatePreviewContent'
import FormModal from '@/components/forms/FormModal'
import PricingModelFormFields from '@/components/forms/PricingModelFormFields'
import { createPricingModelSchema } from '@/db/schema/pricingModels'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { generateTemplateName } from '@/utils/pricingModelTemplates'
import { ImportPricingModel } from './ImportPricingModel'
import { DialogFooter, DialogHeader } from '../ui/dialog'
import { Button } from '../ui/button'
import { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

type ModalView = 'selector' | 'preview' | 'blank' | 'import'

interface CreatePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const CreatePricingModelModal: React.FC<
  CreatePricingModelModalProps
> = ({ isOpen, setIsOpen }) => {
  const router = useRouter()

  // Single modal with different views
  const [currentView, setCurrentView] =
    useState<ModalView>('selector')
  const [selectedTemplate, setSelectedTemplate] =
    useState<PricingModelTemplate | null>(null)
  const [parsedYamlData, setParsedYamlData] =
    useState<SetupPricingModelInput | null>(null)

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
    setCurrentView('selector')
    setSelectedTemplate(null)
    setParsedYamlData(null)
  }

  const handleTemplateSelect = (template: PricingModelTemplate) => {
    setSelectedTemplate(template)
    setCurrentView('preview')
  }

  const handleCreateBlank = () => {
    setCurrentView('blank')
  }

  const handleImportPricingModel = () => {
    setCurrentView('import')
  }

  const handleBackToSelector = () => {
    setCurrentView('selector')
    setSelectedTemplate(null)
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

  // Render blank form separately as it has its own Dialog
  if (currentView === 'blank') {
    return (
      <FormModal
        isOpen={isOpen}
        setIsOpen={(open) => {
          if (!open) {
            handleCloseModal()
          }
        }}
        title="Create Pricing Model"
        formSchema={createPricingModelSchema}
        defaultValues={{ pricingModel: { name: '' } }}
        onSubmit={createPricingModelMutation.mutateAsync}
      >
        <PricingModelFormFields />
      </FormModal>
    )
  }

  if (currentView === 'import') {
    return (
      <Dialog open={isOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Pricing Model</DialogTitle>
          </DialogHeader>
          <ImportPricingModel
            onParsedData={(data) => setParsedYamlData(data)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (parsedYamlData) {
                  await setupPricingModelMutation.mutateAsync(
                    parsedYamlData
                  )
                } else {
                  toast.error('Please upload a valid YAML file')
                }
              }}
              disabled={
                !parsedYamlData || setupPricingModelMutation.isPending
              }
            >
              {setupPricingModelMutation.isPending
                ? 'Importing...'
                : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Single Dialog with one DialogContent that changes styling based on view
  return (
    <Dialog open={isOpen} onOpenChange={handleCloseModal}>
      <DialogContent
        className={
          currentView === 'selector'
            ? 'w-[calc(100vw-32px)] sm:w-[calc(100vw-64px)] sm:max-w-[1200px] p-0 sm:p-0 gap-0 max-h-[90vh] overflow-hidden rounded-3xl'
            : 'w-[calc(100vw-32px)] sm:max-w-[600px] p-4 sm:p-4 gap-0 overflow-clip'
        }
        style={{
          transition: 'none',
          animation: 'none',
          transitionDuration: '0s',
          animationDuration: '0s',
        }}
      >
        <DialogTitle className="sr-only">
          {currentView === 'selector'
            ? 'Create Pricing Model'
            : selectedTemplate?.metadata.title}
        </DialogTitle>

        {currentView === 'selector' ? (
          <TemplateSelectorContent
            onTemplateSelect={handleTemplateSelect}
            onCreateBlank={handleCreateBlank}
            onImportPricingModel={handleImportPricingModel}
          />
        ) : (
          selectedTemplate && (
            <TemplatePreviewContent
              template={selectedTemplate}
              onBack={handleBackToSelector}
              onConfirm={handleConfirmTemplate}
              isCreating={setupPricingModelMutation.isPending}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  )
}

export default CreatePricingModelModal
