'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PricingModelTemplateMetadata } from '@/types/pricingModelTemplates'
import Image from 'next/image'

interface TemplateCardProps {
  metadata: PricingModelTemplateMetadata
  onCustomize: () => void
}

export function TemplateCard({
  metadata,
  onCustomize,
}: TemplateCardProps) {
  const { title, icon: Icon, features, usedBy } = metadata

  return (
    <div className="flex flex-col gap-2.5 px-3 md:px-8 py-8 min-h-80 border border-border rounded-3xl">
      {/* Inner card wrapper with justify-between */}
      <div className="flex-1 flex flex-col justify-between min-h-0 w-full gap-4">
        {/* Top Content */}
        <div className="flex flex-col gap-4 px-4 py-0 items-start w-full">
          {/* Icon + Title */}
          <div className="flex flex-col gap-2.5 items-start w-full">
            <Icon className="h-5 w-5 text-foreground flex-shrink-0" />
            <h3 className="text-lg font-semibold min-w-full w-min">
              {title}
            </h3>
          </div>

          {/* Features List */}
          <div className="flex flex-col gap-2.5 items-start w-full">
            {features.map((feature, index) => {
              const FeatureIcon = feature.icon
              return (
                <div
                  key={index}
                  className="flex gap-2.5 items-start w-full"
                >
                  {/* Icon wrapper */}
                  <div className="flex gap-2.5 items-center py-0.5 px-0">
                    <FeatureIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </div>
                  <span className="flex-1 min-w-0 text-sm text-muted-foreground">
                    {feature.text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col gap-2 items-start w-full">
          {/* Customize Button */}
          <Button
            onClick={onCustomize}
            variant="secondary"
            className="w-full justify-between group"
          >
            <span>Use Template</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>

          {/* Used By */}
          <div className="flex gap-4 items-center px-4 py-0 w-full">
            <div className="flex gap-1 items-center">
              <span className="text-sm text-muted-foreground">
                used by
              </span>
              {typeof usedBy.logo === 'string' ? (
                usedBy.logo.startsWith('http') ? (
                  <Image
                    src={usedBy.logo}
                    alt={usedBy.name}
                    width={76}
                    height={24}
                    className="h-6"
                  />
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">
                    {usedBy.name}
                  </span>
                )
              ) : (
                <div className="flex gap-1 items-center overflow-clip p-1 rounded-full">
                  <usedBy.logo className="h-4 w-4" />
                  <span className="text-xs font-semibold text-muted-foreground tracking-tight">
                    {usedBy.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
