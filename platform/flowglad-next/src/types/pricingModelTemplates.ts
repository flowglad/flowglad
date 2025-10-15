import type { LucideIcon } from 'lucide-react'
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

/**
 * Company information displayed in template cards
 */
export interface TemplateCompanyInfo {
  /** Company name (e.g., "Cursor", "ChatGPT") */
  name: string
  /** Company logo - can be URL string or Lucide icon component */
  logo: string | LucideIcon
}

/**
 * Feature highlight displayed in template card with icon
 */
export interface TemplateFeatureHighlight {
  /** Lucide icon component for the feature */
  icon: LucideIcon
  /** Short descriptive text (max ~50 chars for UI) */
  text: string
}

/**
 * Display metadata for pricing model template card
 */
export interface PricingModelTemplateMetadata {
  /** Unique identifier for the template (kebab-case) */
  id: string
  /** Display title shown at top of card */
  title: string
  /** Brief description paragraph (2-3 lines, ~120 chars) */
  description: string
  /** Large icon displayed at top of card */
  icon: LucideIcon
  /** Array of 3 feature highlights with icons */
  features: [
    TemplateFeatureHighlight,
    TemplateFeatureHighlight,
    TemplateFeatureHighlight,
  ]
  /** Company using this pricing model */
  usedBy: TemplateCompanyInfo
}

/**
 * Complete pricing model template with metadata and setup input
 */
export interface PricingModelTemplate {
  /** Display metadata for template card and preview */
  metadata: PricingModelTemplateMetadata
  /** Setup input passed to setupPricingModelTransaction */
  input: SetupPricingModelInput
}

/**
 * Type guard to validate template structure
 */
export function isPricingModelTemplate(
  obj: unknown
): obj is PricingModelTemplate {
  const template = obj as PricingModelTemplate
  return (
    typeof template?.metadata?.id === 'string' &&
    typeof template?.metadata?.title === 'string' &&
    Array.isArray(template?.metadata?.features) &&
    template.metadata.features.length === 3 &&
    template?.input !== undefined
  )
}
