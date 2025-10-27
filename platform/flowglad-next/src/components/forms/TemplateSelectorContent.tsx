'use client'

import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { TemplateGrid } from '@/components/pricing-model-templates/TemplateGrid'
import { PRICING_MODEL_TEMPLATES } from '@/constants/pricingModelTemplates'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'

interface TemplateSelectorContentProps {
  onTemplateSelect: (template: PricingModelTemplate) => void
  onCreateBlank: () => void
  onImportPricingModel: () => void
}

export function TemplateSelectorContent({
  onTemplateSelect,
  onCreateBlank,
  onImportPricingModel,
}: TemplateSelectorContentProps) {
  return (
    <>
      {/* Sticky Header */}
      <div className="bg-background border-b sticky top-0 z-10 flex items-center justify-between pl-6 md:pl-6 pr-4 py-4 rounded-t-3xl">
        <h2 className="text-xl font-semibold" aria-hidden="true">
          Create Pricing Model
        </h2>
        <div className="flex items-center gap-2">
          <Button onClick={onCreateBlank} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
          <Button onClick={onImportPricingModel} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Import
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="overflow-y-auto max-h-[calc(90vh-72px)] bg-background flex justify-center w-full">
        <div className="w-full">
          <TemplateGrid
            templates={PRICING_MODEL_TEMPLATES}
            onTemplateSelect={onTemplateSelect}
          />
        </div>
      </div>
    </>
  )
}
