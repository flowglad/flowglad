'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import { TemplateGrid } from '@/components/pricing-model-templates/TemplateGrid'
import { PRICING_MODEL_TEMPLATES } from '@/constants/pricingModelTemplates'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'

interface PricingModelTemplateSelectorProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  onTemplateSelect: (template: PricingModelTemplate) => void
  onCreateBlank: () => void
}

export function PricingModelTemplateSelector({
  isOpen,
  setIsOpen,
  onTemplateSelect,
  onCreateBlank,
}: PricingModelTemplateSelectorProps) {
  const [searchValue, setSearchValue] = useState('')

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="w-[calc(100vw-32px)] sm:w-[calc(100vw-64px)] sm:max-w-[1200px] p-0 sm:p-0 gap-0 max-h-[90vh] overflow-hidden rounded-3xl">
        <DialogTitle className="sr-only">
          Create Pricing Model
        </DialogTitle>
        {/* Sticky Header */}
        <div className="bg-background border-b border-dashed sticky top-0 z-10 flex items-center justify-between pl-6 md:pl-6 pr-4 py-4 rounded-t-3xl">
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

        {/* Content Area - Figma: max-w-1100px */}
        <div className="overflow-y-auto max-h-[calc(90vh-72px)] bg-background flex justify-center w-full">
          <div className="w-full">
            {/* Template Grid */}
            <TemplateGrid
              templates={PRICING_MODEL_TEMPLATES}
              onTemplateSelect={onTemplateSelect}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
