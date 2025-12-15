'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import PricingModelFormFields from '@/components/forms/PricingModelFormFields'
import { TemplatePreviewContent } from '@/components/pricing-model-templates/TemplatePreviewContent'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  type CreatePricingModelInput,
  createPricingModelSchema,
} from '@/db/schema/pricingModels'
import { IntervalUnit } from '@/types'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import { generateTemplateName } from '@/utils/pricingModelTemplates'
import { Button } from '../ui/button'
import { DialogFooter, DialogHeader } from '../ui/dialog'
import { ImportPricingModel } from './ImportPricingModel'
import { TemplateSelectorContent } from './TemplateSelectorContent'

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

  // Form for blank pricing model creation
  const form = useForm<CreatePricingModelInput>({
    resolver: zodResolver(createPricingModelSchema),
    defaultValues: {
      pricingModel: { name: '' },
      defaultPlanIntervalUnit: IntervalUnit.Month,
    },
    mode: 'onSubmit',
  })

  // TRPC mutations
  const createPricingModelMutation =
    trpc.pricingModels.create.useMutation({
      onSuccess: ({ pricingModel }) => {
        toast.success('Pricing model created successfully')
        setIsOpen(false)
        router.push(`/pricing-models/${pricingModel.id}`)
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
        router.push(`/pricing-models/${pricingModel.id}`)
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
    form.reset({
      pricingModel: { name: '' },
      defaultPlanIntervalUnit: IntervalUnit.Month,
    })
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

  const handleConfirmTemplate = async ({
    isDefault,
  }: {
    isDefault: boolean
  }) => {
    if (!selectedTemplate) return

    // Modify template name to be unique for this user
    const customizedInput = {
      ...selectedTemplate.input,
      name: generateTemplateName(selectedTemplate.input.name),
      isDefault,
    }

    await setupPricingModelMutation.mutateAsync(customizedInput)
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    resetState()
  }

  // Get dialog content className based on view
  const getDialogClassName = () => {
    if (currentView === 'selector') {
      return 'w-[calc(100vw-32px)] sm:w-[calc(100vw-64px)] sm:max-w-[1200px] p-0 sm:p-0 gap-0 max-h-[90vh] overflow-hidden'
    }
    if (currentView === 'blank') {
      return 'w-[calc(100vw-32px)] sm:max-w-md p-4 sm:p-6 gap-4 max-h-[90vh]'
    }
    if (currentView === 'import') {
      return 'w-[calc(100vw-32px)] sm:max-w-md p-4 sm:p-6 gap-4 max-h-[90vh]'
    }
    // preview
    return 'w-[calc(100vw-32px)] sm:max-w-[600px] p-4 sm:p-4 gap-0 overflow-clip'
  }

  // Get dialog title based on view
  const getDialogTitle = () => {
    if (currentView === 'selector') return 'Create Pricing Model'
    if (currentView === 'blank') return 'Create Pricing Model'
    if (currentView === 'import') return 'Import Pricing Model'
    return selectedTemplate?.metadata.title || 'Template Preview'
  }

  // Render content based on current view
  const renderContent = () => {
    switch (currentView) {
      case 'selector':
        return (
          <TemplateSelectorContent
            onTemplateSelect={handleTemplateSelect}
            onCreateBlank={handleCreateBlank}
            onImportPricingModel={handleImportPricingModel}
          />
        )

      case 'preview':
        return selectedTemplate ? (
          <TemplatePreviewContent
            template={selectedTemplate}
            onBack={handleBackToSelector}
            onConfirm={handleConfirmTemplate}
            isCreating={setupPricingModelMutation.isPending}
          />
        ) : null

      case 'blank':
        return (
          <FormProvider {...form}>
            <form
              onSubmit={form.handleSubmit(async (data) => {
                await createPricingModelMutation.mutateAsync(data)
              })}
              className="flex flex-col gap-4 h-full"
            >
              <DialogHeader>
                <DialogTitle>Create Pricing Model</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto">
                <PricingModelFormFields />
              </div>
              <div className="flex items-start justify-between w-full gap-4 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={handleBackToSelector}
                  aria-label="Go back to template selector"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  disabled={createPricingModelMutation.isPending}
                >
                  {createPricingModelMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </form>
          </FormProvider>
        )

      case 'import':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Import Pricing Model</DialogTitle>
            </DialogHeader>
            <ImportPricingModel
              onParsedData={(data) => setParsedYamlData(data)}
            />
            <div className="flex items-start justify-between w-full gap-4 pt-4">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleBackToSelector}
                aria-label="Go back to template selector"
              >
                <ArrowLeft className="h-4 w-4" />
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
                  !parsedYamlData ||
                  setupPricingModelMutation.isPending
                }
              >
                {setupPricingModelMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Import'
                )}
              </Button>
            </div>
          </>
        )

      default:
        return null
    }
  }

  // Single Dialog for all views
  return (
    <Dialog open={isOpen} onOpenChange={handleCloseModal}>
      <DialogContent
        className={getDialogClassName()}
        style={{
          transition: 'none',
          animation: 'none',
          transitionDuration: '0s',
          animationDuration: '0s',
        }}
      >
        {/* Only render sr-only title for selector and preview (accessibility) */}
        {(currentView === 'selector' ||
          currentView === 'preview') && (
          <DialogTitle className="sr-only">
            {getDialogTitle()}
          </DialogTitle>
        )}
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}

export default CreatePricingModelModal
