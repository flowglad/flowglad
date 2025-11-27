'use client'

import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { TemplateCard } from './TemplateCard'

interface TemplateGridProps {
  templates: ReadonlyArray<PricingModelTemplate>
  onTemplateSelect: (template: PricingModelTemplate) => void
}

export function TemplateGrid({
  templates,
  onTemplateSelect,
}: TemplateGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
      {templates.map((template, index) => (
        <TemplateCard
          key={index}
          metadata={template.metadata}
          onCustomize={() => onTemplateSelect(template)}
        />
      ))}
    </div>
  )
}
