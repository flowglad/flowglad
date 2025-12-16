'use client'

import { ArrowLeft } from 'lucide-react'
import { TemplateGrid } from '@/components/pricing-model-templates/TemplateGrid'
import { Button } from '@/components/ui/button'
import { PRICING_MODEL_TEMPLATES } from '@/constants/pricingModelTemplates'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'

interface TemplateSelectorContentProps {
  onTemplateSelect: (template: PricingModelTemplate) => void
  onBack?: () => void
}

export function TemplateSelectorContent({
  onTemplateSelect,
  onBack,
}: TemplateSelectorContentProps) {
  return (
    <div className="flex flex-col h-full max-h-[90vh]">
      {/* Sticky Header */}
      <div className="bg-background border-b sticky top-0 z-10 flex items-center pl-6 md:pl-6 pr-4 py-4 rounded-t-3xl">
        <h2 className="text-xl" aria-hidden="true">
          Choose a Template
        </h2>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-background flex justify-center w-full">
        <div className="w-full">
          <TemplateGrid
            templates={PRICING_MODEL_TEMPLATES}
            onTemplateSelect={onTemplateSelect}
          />
        </div>
      </div>

      {/* Footer with Back Button */}
      {onBack && (
        <div className="bg-background border-t sticky bottom-0 z-10 flex items-center justify-start px-4 py-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBack}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
