'use client'

import { TemplateCard } from './TemplateCard'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'

interface TemplateGridProps {
  templates: ReadonlyArray<PricingModelTemplate>
  onTemplateSelect: (template: PricingModelTemplate) => void
}

export function TemplateGrid({
  templates,
  onTemplateSelect,
}: TemplateGridProps) {
  return (
    <div className="flex flex-col px-4 py-4 md:px-8 md:py-8">
      {/* Mobile/Tablet: Single column */}
      <div className="md:hidden flex flex-col gap-8">
        {templates.map((template, index) => (
          <div key={index}>
            <TemplateCard
              metadata={template.metadata}
              onCustomize={() => onTemplateSelect(template)}
            />
          </div>
        ))}
      </div>

      {/* Desktop: Two columns */}
      <div className="hidden md:flex md:flex-col gap-8">
        {Array.from({ length: Math.ceil(templates.length / 2) }).map(
          (_, rowIndex) => {
            const firstTemplate = templates[rowIndex * 2]
            const secondTemplate = templates[rowIndex * 2 + 1]

            return (
              <div key={rowIndex} className="flex flex-row gap-8">
                <div className="flex-1 min-w-0">
                  <TemplateCard
                    metadata={firstTemplate.metadata}
                    onCustomize={() =>
                      onTemplateSelect(firstTemplate)
                    }
                  />
                </div>
                {secondTemplate !== undefined && (
                  <div className="flex-1 min-w-0">
                    <TemplateCard
                      metadata={secondTemplate.metadata}
                      onCustomize={() =>
                        onTemplateSelect(secondTemplate)
                      }
                    />
                  </div>
                )}
              </div>
            )
          }
        )}
      </div>
    </div>
  )
}
