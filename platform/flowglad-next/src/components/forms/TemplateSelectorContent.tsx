'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import { TemplateGrid } from '@/components/pricing-model-templates/TemplateGrid'
import { PRICING_MODEL_TEMPLATES } from '@/constants/pricingModelTemplates'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'

interface TemplateSelectorContentProps {
  onTemplateSelect: (template: PricingModelTemplate) => void
  onCreateBlank: () => void
}

export function TemplateSelectorContent({
  onTemplateSelect,
  onCreateBlank,
}: TemplateSelectorContentProps) {
  const [searchValue, setSearchValue] = useState('')

  return (
    <>
      {/* Sticky Header */}
      <div className="bg-background border-b sticky top-0 z-10 flex items-center justify-between pl-6 md:pl-6 pr-4 py-4 rounded-t-3xl">
        <h2 className="text-xl font-semibold" aria-hidden="true">
          Create Pricing Model
        </h2>
        <div className="flex items-center gap-2">
          {/* Collapsible Search for Mobile/Tablet (hidden on md+) */}
          <div className="md:hidden">
            <CollapsibleSearch
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Search name, company, etc..."
              disabled
              size="default"
            />
          </div>

          {/* Regular Search for Desktop (hidden below md) */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, company, etc..."
              className="pl-9 h-9 w-[280px] rounded-full"
              disabled
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
          <Button onClick={onCreateBlank} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New
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
