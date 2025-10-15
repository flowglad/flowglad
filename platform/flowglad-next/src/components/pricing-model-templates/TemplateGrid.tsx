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
  // Group templates into rows of 2
  const rows: Array<
    [PricingModelTemplate, PricingModelTemplate | undefined]
  > = []
  for (let i = 0; i < templates.length; i += 2) {
    rows.push([templates[i], templates[i + 1]])
  }

  return (
    <div className="flex flex-col">
      {rows.map((row, rowIndex) => {
        const [firstTemplate, secondTemplate] = row
        return (
          <div
            key={rowIndex}
            className="flex flex-row border-t border-dashed first:border-t-0"
          >
            <div className="flex-1 min-w-0">
              <TemplateCard
                metadata={firstTemplate.metadata}
                onCustomize={() => onTemplateSelect(firstTemplate)}
              />
            </div>
            {secondTemplate !== undefined && (
              <>
                <div className="w-px border-l border-dashed" />
                <div className="flex-1 min-w-0">
                  <TemplateCard
                    metadata={secondTemplate.metadata}
                    onCustomize={() =>
                      onTemplateSelect(secondTemplate)
                    }
                  />
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
