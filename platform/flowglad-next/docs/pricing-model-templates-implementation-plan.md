# Pricing Model Templates - Implementation Plan

## Executive Summary

This document outlines a comprehensive, error-free implementation plan for Pricing Model Templates in the Flowglad dashboard. Templates will accelerate user onboarding by providing pre-configured pricing models that can be customized and deployed with a single click.

---

## Table of Contents

1. [Architecture & Design Decisions](#architecture--design-decisions)
2. [Data Structure & Type System](#data-structure--type-system)
3. [Component Hierarchy](#component-hierarchy)
4. [Implementation Phases](#implementation-phases)
5. [Template Definitions](#template-definitions)
6. [Testing Strategy](#testing-strategy)
7. [Future Considerations](#future-considerations)
8. [Research Questions](#research-questions)

---

## Architecture & Design Decisions

### 1. Template Storage Strategy (Hardcoded → Database)

**Phase 1: Hardcoded Templates (Current Scope)**
- Templates defined as TypeScript constants in `/platform/flowglad-next/src/constants/pricingModelTemplates.ts`
- ✅ **Pros**: Fast to implement, type-safe, no database migrations, easy to version control
- ⚠️ **Cons**: Requires code deployment to add templates, not organization-specific

**Phase 2: Database-Backed Templates (Future)**
- Migration path outlined in [Future Considerations](#future-considerations)
- Allows per-organization templates and dynamic template marketplace

### 2. Separation of Concerns (Validated Best Practice)

Agree's recommendation to separate display metadata from backend input is **correct and follows best practices**:

```typescript
interface PricingModelTemplate {
  // Frontend: Display & UX
  metadata: {
    id: string
    title: string
    description: string
    icon: LucideIcon
    features: Array<{ icon: LucideIcon; text: string }>
    usedBy: { name: string; logo: string | LucideIcon | SvgLogo }
  }
  
  // Backend: Data creation (reuses existing types)
  input: SetupPricingModelInput
}
```

**Why This Is Best Practice:**
1. **Single Responsibility**: Metadata handles presentation, input handles business logic
2. **Type Safety**: Leverages existing `SetupPricingModelInput` type with full validation
3. **Maintainability**: Backend schema changes don't affect template metadata
4. **Testability**: Can test templates using existing `setupTransaction.test.ts` patterns
5. **Reusability**: Same TRPC `pricingModels.setup` mutation, zero backend changes required

**Alternative Considered:**
Combining metadata + input into a single flat structure would violate single responsibility principle and create tight coupling between presentation and data layers.

**Decision:** ✅ Implement Agree's structure

---

## Data Structure & Type System

### Type Location Analysis

**Option A: `packages/types`** (Core product types)
- Contains: Enums (PriceType, FeatureType), Currency, Catalog types
- Used by: All packages (React, Server, Express, Next.js)
- ❌ **Decision**: Templates are platform-specific (Next.js dashboard), not core product types

**Option B: `packages/shared`** (Shared utilities)
- Contains: Action schemas, validation utilities
- Used by: Multiple platforms needing shared business logic
- ❌ **Decision**: Templates are UI-specific, not shared business logic

**Option C: Platform Next.js App** (`platform/flowglad-next/src/types/`)
- Contains: Platform-specific types, DB schemas, API types
- ✅ **Decision**: Templates are dashboard-specific, should live here

### Type Definitions

**File:** `/platform/flowglad-next/src/types/pricingModelTemplates.ts`

```typescript
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
  features: [TemplateFeatureHighlight, TemplateFeatureHighlight, TemplateFeatureHighlight]
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
export function isPricingModelTemplate(obj: unknown): obj is PricingModelTemplate {
  const template = obj as PricingModelTemplate
  return (
    typeof template?.metadata?.id === 'string' &&
    typeof template?.metadata?.title === 'string' &&
    Array.isArray(template?.metadata?.features) &&
    template.metadata.features.length === 3 &&
    template?.input !== undefined
  )
}
```

---

## Component Hierarchy

### Component Tree

```
InnerPricingModelsPage (existing)
└── CreatePricingModelModal (modified)
    ├── PricingModelTemplateSelector (new)
    │   ├── DialogHeader
    │   ├── Input (search - future)
    │   └── TemplateGrid (new)
    │       └── TemplateCard (new) × N
    │           ├── TemplateCardIcon (new)
    │           ├── TemplateCardTitle (new)
    │           ├── TemplateCardFeatures (new)
    │           └── TemplateCardFooter (new)
    └── TemplatePreviewModal (new)
        ├── DialogHeader
        ├── TemplatePreviewSummary (new)
        │   ├── ProductsSummary (new)
        │   ├── PricesSummary (new)
        │   ├── FeaturesSummary (new)
        │   └── UsageMetersSummary (new)
        └── DialogFooter with "Use Template" button
```

### File Structure

```
platform/flowglad-next/src/
├── types/
│   └── pricingModelTemplates.ts (new)
├── constants/
│   └── pricingModelTemplates.ts (new)
├── components/
│   ├── forms/
│   │   ├── CreatePricingModelModal.tsx (modified)
│   │   └── PricingModelTemplateSelector.tsx (new)
│   └── pricing-model-templates/ (new directory)
│       ├── TemplateGrid.tsx
│       ├── TemplateCard.tsx
│       ├── TemplateCardIcon.tsx
│       ├── TemplateCardTitle.tsx
│       ├── TemplateCardFeatures.tsx
│       ├── TemplateCardFooter.tsx
│       ├── TemplatePreviewModal.tsx
│       ├── TemplatePreviewSummary.tsx
│       ├── ProductsSummary.tsx
│       ├── PricesSummary.tsx
│       ├── FeaturesSummary.tsx
│       └── UsageMetersSummary.tsx
└── utils/
    └── pricingModelTemplates.ts (new - helper functions)
```

---

## Implementation Phases

### Phase 1: Type System & Data Layer

**Files to Create:**
1. `/src/types/pricingModelTemplates.ts` - Type definitions
2. `/src/constants/pricingModelTemplates.ts` - Template data
3. `/src/utils/pricingModelTemplates.ts` - Helper functions

**Implementation Steps:**

#### 1.1 Create Type Definitions
See [Type Definitions](#type-definitions) section above.

#### 1.2 Create Template Data Constants

**File:** `/platform/flowglad-next/src/constants/pricingModelTemplates.ts`

```typescript
import {
  Layers,
  Infinity,
  Clock,
  RefreshCw,
  CreditCard,
  Lock,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  PriceType,
  IntervalUnit,
} from '@/types'

/**
 * Usage-Limit Subscription Template
 * Used by: Cursor
 * Model: 4 tiered plans with monthly usage credit limits
 */
export const USAGE_LIMIT_SUBSCRIPTION_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'usage-limit-subscription',
    title: 'Usage-limit subscription',
    description: 'Perfect for SaaS products with tiered usage limits. Includes 4 plans with monthly renewals and optional on-demand credits.',
    icon: Layers,
    features: [
      {
        icon: RefreshCw,
        text: '4 plans renew monthly / yearly',
      },
      {
        icon: Clock,
        text: 'Monthly usage credit limit',
      },
      {
        icon: CreditCard,
        text: 'Optional on-demand credits',
      },
    ],
    usedBy: {
      name: 'Cursor',
      logo: 'CURSOR', // TODO: Replace with actual logo URL or component
    },
  },
  input: {
    name: 'Usage-Limit Subscription',
    isDefault: false,
    
    // Usage Meters
    usageMeters: [
      { slug: 'api-requests', name: 'API Requests' },
      { slug: 'ai-completions', name: 'AI Completions' },
      { slug: 'storage-gb', name: 'Storage (GB)' },
    ],
    
    // Features
    features: [
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'hobby-api-requests',
        name: 'API Requests - Hobby',
        description: 'Monthly API request credits for Hobby plan',
        usageMeterSlug: 'api-requests',
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'pro-api-requests',
        name: 'API Requests - Pro',
        description: 'Monthly API request credits for Pro plan',
        usageMeterSlug: 'api-requests',
        amount: 10000,
        renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'pro-plus-api-requests',
        name: 'API Requests - Pro+',
        description: 'Monthly API request credits for Pro+ plan',
        usageMeterSlug: 'api-requests',
        amount: 50000,
        renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'ultra-api-requests',
        name: 'API Requests - Ultra',
        description: 'Monthly API request credits for Ultra plan',
        usageMeterSlug: 'api-requests',
        amount: 200000,
        renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'priority-support',
        name: 'Priority Support',
        description: 'Access to priority customer support',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'advanced-analytics',
        name: 'Advanced Analytics',
        description: 'Access to advanced analytics dashboard',
        active: true,
      },
    ],
    
    // Products
    products: [
      {
        product: {
          name: 'Hobby',
          default: false,
          description: 'Perfect for personal projects and experimentation',
          slug: 'hobby',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'hobby-monthly',
            isDefault: true,
            name: 'Hobby Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 0, // $0/month
          },
        ],
        features: ['hobby-api-requests'],
      },
      {
        product: {
          name: 'Pro',
          default: false,
          description: 'For professionals and small teams',
          slug: 'pro',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro-monthly',
            isDefault: true,
            name: 'Pro Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 2000, // $20/month
          },
          {
            type: PriceType.Subscription,
            slug: 'pro-yearly',
            isDefault: false,
            name: 'Pro Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 19200, // $192/year (20% discount)
          },
        ],
        features: ['pro-api-requests', 'priority-support'],
      },
      {
        product: {
          name: 'Pro+',
          default: false,
          description: 'For growing businesses with higher demands',
          slug: 'pro-plus',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro-plus-monthly',
            isDefault: true,
            name: 'Pro+ Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 6000, // $60/month
          },
          {
            type: PriceType.Subscription,
            slug: 'pro-plus-yearly',
            isDefault: false,
            name: 'Pro+ Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 56000, // $560/year (~22% discount)
          },
        ],
        features: ['pro-plus-api-requests', 'priority-support', 'advanced-analytics'],
      },
      {
        product: {
          name: 'Ultra',
          default: false,
          description: 'For enterprises with maximum usage needs',
          slug: 'ultra',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'ultra-monthly',
            isDefault: true,
            name: 'Ultra Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 20000, // $200/month
          },
          {
            type: PriceType.Subscription,
            slug: 'ultra-yearly',
            isDefault: false,
            name: 'Ultra Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 192000, // $1,920/year (20% discount)
          },
        ],
        features: ['ultra-api-requests', 'priority-support', 'advanced-analytics'],
      },
    ],
  },
}

/**
 * Unlimited Usage Subscription Template
 * Used by: ChatGPT
 * Model: Simple tiered plans with unlimited usage for paid tiers
 */
export const UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'unlimited-usage-subscription',
    title: 'Unlimited usage subscription',
    description: 'Simple tiered pricing with unlimited usage for paid plans. Perfect for services offering unrestricted access to features.',
    icon: Infinity,
    features: [
      {
        icon: RefreshCw,
        text: '4 plans renew monthly / yearly',
      },
      {
        icon: Infinity,
        text: 'Unlimited usage for tiered products',
      },
      {
        icon: Lock,
        text: 'Plan-based product access',
      },
    ],
    usedBy: {
      name: 'ChatGPT',
      logo: 'CHATGPT', // TODO: Replace with actual logo URL or component
    },
  },
  input: {
    name: 'Unlimited Usage Subscription',
    isDefault: false,
    
    // No usage meters for unlimited model
    usageMeters: [],
    
    // Features
    features: [
      {
        type: FeatureType.Toggle,
        slug: 'basic-access',
        name: 'Basic Access',
        description: 'Access to basic features',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'advanced-features',
        name: 'Advanced Features',
        description: 'Access to advanced AI models',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'team-collaboration',
        name: 'Team Collaboration',
        description: 'Collaborate with team members',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'priority-access',
        name: 'Priority Access',
        description: 'Priority access during high demand',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'api-access',
        name: 'API Access',
        description: 'Programmatic API access',
        active: true,
      },
    ],
    
    // Products
    products: [
      {
        product: {
          name: 'Free',
          default: false,
          description: 'Get started with basic features',
          slug: 'free-unlimited',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free-unlimited-monthly',
            isDefault: true,
            name: 'Free Plan',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 0,
          },
        ],
        features: ['basic-access'],
      },
      {
        product: {
          name: 'Plus',
          default: false,
          description: 'Unlimited access to advanced features',
          slug: 'plus',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'plus-monthly',
            isDefault: true,
            name: 'Plus Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 2000, // $20/month
          },
          {
            type: PriceType.Subscription,
            slug: 'plus-yearly',
            isDefault: false,
            name: 'Plus Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 19200, // $192/year
          },
        ],
        features: ['basic-access', 'advanced-features', 'priority-access'],
      },
      {
        product: {
          name: 'Team',
          default: false,
          description: 'For teams with collaboration needs',
          slug: 'team',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'team-monthly',
            isDefault: true,
            name: 'Team Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 5000, // $50/month
          },
          {
            type: PriceType.Subscription,
            slug: 'team-yearly',
            isDefault: false,
            name: 'Team Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 48000, // $480/year (20% discount)
          },
        ],
        features: ['basic-access', 'advanced-features', 'priority-access', 'team-collaboration'],
      },
      {
        product: {
          name: 'Enterprise',
          default: false,
          description: 'Full access with API and enterprise support',
          slug: 'enterprise',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'enterprise-monthly',
            isDefault: true,
            name: 'Enterprise Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 15000, // $150/month
          },
          {
            type: PriceType.Subscription,
            slug: 'enterprise-yearly',
            isDefault: false,
            name: 'Enterprise Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 144000, // $1,440/year (20% discount)
          },
        ],
        features: ['basic-access', 'advanced-features', 'priority-access', 'team-collaboration', 'api-access'],
      },
    ],
  },
}

/**
 * All available pricing model templates
 */
export const PRICING_MODEL_TEMPLATES: ReadonlyArray<PricingModelTemplate> = [
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
] as const

/**
 * Get template by ID
 */
export function getTemplateById(id: string): PricingModelTemplate | undefined {
  return PRICING_MODEL_TEMPLATES.find((template) => template.metadata.id === id)
}
```

#### 1.3 Create Helper Utilities

**File:** `/platform/flowglad-next/src/utils/pricingModelTemplates.ts`

```typescript
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

/**
 * Format currency amount (cents) to display string
 * @example formatCurrency(2000) => "$20.00"
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Get human-readable interval string
 * @example getIntervalString('month', 1) => "Monthly"
 * @example getIntervalString('year', 1) => "Yearly"
 */
export function getIntervalString(unit: string, count: number): string {
  if (count === 1) {
    return unit === 'month' ? 'Monthly' : unit === 'year' ? 'Yearly' : `Every ${unit}`
  }
  return `Every ${count} ${unit}s`
}

/**
 * Count total objects that will be created from a template
 */
export function getTemplateCounts(input: SetupPricingModelInput) {
  const productCount = input.products.length
  const priceCount = input.products.reduce((sum, p) => sum + p.prices.length, 0)
  const featureCount = input.features.length
  const usageMeterCount = input.usageMeters.length
  
  return {
    products: productCount,
    prices: priceCount,
    features: featureCount,
    usageMeters: usageMeterCount,
    total: productCount + priceCount + featureCount + usageMeterCount,
  }
}

/**
 * Generate unique name for cloned template
 * @example generateTemplateName("Usage-Limit Subscription") => "Usage-Limit Subscription (My Template)"
 */
export function generateTemplateName(baseTemplateName: string): string {
  return `${baseTemplateName} (My Template)`
}
```

---

### Phase 2: Component Implementation (Shadcn Consistency)

#### 2.1 Design System Alignment

**Shadcn Consistency Checklist:**
- ✅ Use `className={cn(...)}` for all style composition
- ✅ Leverage existing Shadcn components: `Dialog`, `Button`, `Card`, `Badge`
- ✅ Follow color variable pattern: `bg-card`, `text-card-foreground`, `border-border`
- ✅ Match spacing: `gap-4`, `gap-6`, `p-4`, `p-6`, `rounded-xl`, `rounded-2xl`
- ✅ Use Lucide icons consistently: `import { Icon } from 'lucide-react'`
- ✅ Match animation patterns: `hover:bg-accent`, `transition-colors`

**Reference Components:**
- Card structure: `/src/components/ui/card.tsx`
- Modal structure: `/src/components/ui/dialog.tsx`
- Button patterns: `/src/components/ui/button.tsx`
- Icon usage: `/src/components/navigation/SideNavigation.tsx`

#### 2.2 Template Card Component

**File:** `/platform/flowglad-next/src/components/pricing-model-templates/TemplateCard.tsx`

```typescript
'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { PricingModelTemplateMetadata } from '@/types/pricingModelTemplates'
import Image from 'next/image'

interface TemplateCardProps {
  metadata: PricingModelTemplateMetadata
  onCustomize: () => void
}

export function TemplateCard({ metadata, onCustomize }: TemplateCardProps) {
  const { title, description, icon: Icon, features, usedBy } = metadata

  return (
    <div
      className={cn(
        // Base card styles matching Shadcn Card
        'bg-card text-card-foreground',
        'flex flex-col gap-4',
        'rounded-xl border border-border',
        'p-6 shadow-sm',
        // Interactive states
        'transition-all duration-200',
        'hover:shadow-md hover:border-border/80',
        // Layout
        'h-full min-h-[320px]',
      )}
    >
      {/* Icon + Title */}
      <div className="flex flex-col gap-3">
        <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
          <Icon className="w-6 h-6 text-accent-foreground" />
        </div>
        <h3 className="text-lg font-semibold leading-tight">{title}</h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed flex-shrink-0">
        {description}
      </p>

      {/* Features List */}
      <div className="flex flex-col gap-2 flex-1">
        {features.map((feature, index) => {
          const FeatureIcon = feature.icon
          return (
            <div key={index} className="flex items-start gap-2">
              <div className="w-4 h-4 mt-0.5 flex-shrink-0">
                <FeatureIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">{feature.text}</span>
            </div>
          )
        })}
      </div>

      {/* Customize Button */}
      <Button
        onClick={onCustomize}
        variant="secondary"
        className="w-full justify-between group"
      >
        <span>Customize Template</span>
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </Button>

      {/* Used By */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">used by</span>
        {typeof usedBy.logo === 'string' ? (
          usedBy.logo.startsWith('http') ? (
            <Image
              src={usedBy.logo}
              alt={usedBy.name}
              width={16}
              height={16}
              className="w-4 h-4"
            />
          ) : (
            <span className="text-xs font-medium">{usedBy.name}</span>
          )
        ) : (
          <div className="flex items-center gap-1">
            {usedBy.logo && <usedBy.logo className="w-4 h-4" />}
            <span className="text-xs font-medium">{usedBy.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

#### 2.3 Template Grid Component

**File:** `/platform/flowglad-next/src/components/pricing-model-templates/TemplateGrid.tsx`

```typescript
'use client'

import { cn } from '@/lib/utils'
import { TemplateCard } from './TemplateCard'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'

interface TemplateGridProps {
  templates: ReadonlyArray<PricingModelTemplate>
  onTemplateSelect: (template: PricingModelTemplate) => void
}

export function TemplateGrid({ templates, onTemplateSelect }: TemplateGridProps) {
  return (
    <div
      className={cn(
        // Grid layout - responsive
        'grid gap-6',
        'grid-cols-1', // Mobile: 1 column
        'sm:grid-cols-2', // Tablet: 2 columns
        'lg:grid-cols-2', // Desktop: 2 columns (matches screenshot)
        'xl:grid-cols-3', // Large desktop: 3 columns
      )}
    >
      {templates.map((template) => (
        <TemplateCard
          key={template.metadata.id}
          metadata={template.metadata}
          onCustomize={() => onTemplateSelect(template)}
        />
      ))}
    </div>
  )
}
```

#### 2.4 Template Selector Modal

**File:** `/platform/flowglad-next/src/components/forms/PricingModelTemplateSelector.tsx`

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
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
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Create Pricing Model</DialogTitle>
            {/* TODO: Add search input here in future iteration */}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* New Button - Create Blank */}
          <div className="flex justify-end">
            <Button
              onClick={onCreateBlank}
              variant="outline"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              New
            </Button>
          </div>

          {/* Template Grid */}
          <TemplateGrid
            templates={PRICING_MODEL_TEMPLATES}
            onTemplateSelect={onTemplateSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

#### 2.5 Template Preview Modal

**File:** `/platform/flowglad-next/src/components/pricing-model-templates/TemplatePreviewModal.tsx`

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { formatCurrency, getIntervalString, getTemplateCounts } from '@/utils/pricingModelTemplates'
import { PriceType } from '@/types'

interface TemplatePreviewModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  template: PricingModelTemplate | null
  onConfirm: () => void
  isCreating: boolean
}

export function TemplatePreviewModal({
  isOpen,
  setIsOpen,
  template,
  onConfirm,
  isCreating,
}: TemplatePreviewModalProps) {
  if (!template) return null

  const counts = getTemplateCounts(template.input)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Template Preview: {template.metadata.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Summary Counts */}
          <div className="flex gap-4 flex-wrap">
            <Badge variant="secondary">{counts.products} Products</Badge>
            <Badge variant="secondary">{counts.prices} Prices</Badge>
            <Badge variant="secondary">{counts.features} Features</Badge>
            {counts.usageMeters > 0 && (
              <Badge variant="secondary">{counts.usageMeters} Usage Meters</Badge>
            )}
          </div>

          {/* Usage Meters (if any) */}
          {template.input.usageMeters.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Usage Meters</h3>
              <div className="flex flex-col gap-2">
                {template.input.usageMeters.map((meter) => (
                  <div
                    key={meter.slug}
                    className="flex items-center gap-2 p-3 rounded-lg bg-accent/50"
                  >
                    <span className="text-sm font-medium">{meter.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      ({meter.slug})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Products & Prices */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Products & Prices</h3>
            <div className="flex flex-col gap-4">
              {template.input.products.map((product) => (
                <div
                  key={product.product.slug}
                  className="flex flex-col gap-3 p-4 rounded-lg border border-border"
                >
                  {/* Product Header */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{product.product.name}</h4>
                      {product.product.default && (
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      )}
                    </div>
                    {product.product.description && (
                      <p className="text-xs text-muted-foreground">
                        {product.product.description}
                      </p>
                    )}
                  </div>

                  {/* Prices */}
                  <div className="flex flex-col gap-2">
                    {product.prices.map((price) => (
                      <div
                        key={price.slug}
                        className="flex items-center justify-between p-2 rounded bg-accent/30"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">
                            {price.name || `${price.type} Price`}
                          </span>
                          {price.type === PriceType.Subscription && (
                            <span className="text-xs text-muted-foreground">
                              {getIntervalString(price.intervalUnit, price.intervalCount)}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-semibold">
                          {formatCurrency(price.unitPrice)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Features */}
                  {product.features.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
                      {product.features.map((featureSlug) => {
                        const feature = template.input.features.find(
                          (f) => f.slug === featureSlug
                        )
                        return (
                          <Badge key={featureSlug} variant="outline" className="text-xs">
                            {feature?.name || featureSlug}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Features List */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">All Features</h3>
            <div className="flex flex-wrap gap-2">
              {template.input.features.map((feature) => (
                <div
                  key={feature.slug}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50"
                >
                  <span className="text-xs font-medium">{feature.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {feature.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={onConfirm}
            disabled={isCreating}
            className="w-full sm:w-auto"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Use Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### 2.6 Modify CreatePricingModelModal

**File:** `/platform/flowglad-next/src/components/forms/CreatePricingModelModal.tsx` (MODIFIED)

```typescript
'use client'

import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { PricingModelTemplateSelector } from './PricingModelTemplateSelector'
import { TemplatePreviewModal } from '@/components/pricing-model-templates/TemplatePreviewModal'
import { FormModal } from './FormModal'
import { PricingModelFormFields } from './PricingModelFormFields'
import { createPricingModelSchema } from '@/db/schema/pricingModels'
import type { PricingModelTemplate } from '@/types/pricingModelTemplates'
import { generateTemplateName } from '@/utils/pricingModelTemplates'

interface CreatePricingModelModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

export default function CreatePricingModelModal({
  isOpen,
  setIsOpen,
}: CreatePricingModelModalProps) {
  const router = useRouter()
  
  // Modal state management
  const [showTemplateSelector, setShowTemplateSelector] = useState(true)
  const [showTemplatePreview, setShowTemplatePreview] = useState(false)
  const [showBlankForm, setShowBlankForm] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<PricingModelTemplate | null>(null)

  // TRPC mutations
  const createPricingModelMutation = trpc.pricingModels.create.useMutation({
    onSuccess: ({ pricingModel }) => {
      toast.success('Pricing model created successfully')
      setIsOpen(false)
      router.push(`/store/pricing-models/${pricingModel.id}`)
      resetState()
    },
    onError: (error) => {
      toast.error('Failed to create pricing model')
      console.error(error)
    },
  })

  const setupPricingModelMutation = trpc.pricingModels.setup.useMutation({
    onSuccess: ({ pricingModel }) => {
      toast.success('Pricing model created from template successfully')
      setIsOpen(false)
      router.push(`/store/pricing-models/${pricingModel.id}`)
      resetState()
    },
    onError: (error) => {
      toast.error('Failed to create pricing model from template')
      console.error(error)
    },
  })

  const resetState = () => {
    setShowTemplateSelector(true)
    setShowTemplatePreview(false)
    setShowBlankForm(false)
    setSelectedTemplate(null)
  }

  const handleTemplateSelect = (template: PricingModelTemplate) => {
    setSelectedTemplate(template)
    setShowTemplateSelector(false)
    setShowTemplatePreview(true)
  }

  const handleCreateBlank = () => {
    setShowTemplateSelector(false)
    setShowBlankForm(true)
  }

  const handleConfirmTemplate = async () => {
    if (!selectedTemplate) return

    // Modify template name to be unique for this user
    const customizedInput = {
      ...selectedTemplate.input,
      name: generateTemplateName(selectedTemplate.input.name),
    }

    await setupPricingModelMutation.mutateAsync(customizedInput)
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    resetState()
  }

  return (
    <>
      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <PricingModelTemplateSelector
          isOpen={isOpen && showTemplateSelector}
          setIsOpen={handleCloseModal}
          onTemplateSelect={handleTemplateSelect}
          onCreateBlank={handleCreateBlank}
        />
      )}

      {/* Template Preview Modal */}
      {showTemplatePreview && selectedTemplate && (
        <TemplatePreviewModal
          isOpen={showTemplatePreview}
          setIsOpen={(open) => {
            if (!open) {
              setShowTemplatePreview(false)
              setShowTemplateSelector(true)
              setSelectedTemplate(null)
            }
          }}
          template={selectedTemplate}
          onConfirm={handleConfirmTemplate}
          isCreating={setupPricingModelMutation.isLoading}
        />
      )}

      {/* Blank Pricing Model Form (existing behavior) */}
      {showBlankForm && (
        <FormModal
          isOpen={isOpen && showBlankForm}
          setIsOpen={(open) => {
            if (!open) {
              handleCloseModal()
            } else {
              setShowBlankForm(true)
            }
          }}
          title="Create Pricing Model"
          formSchema={createPricingModelSchema}
          defaultValues={{ pricingModel: { name: '' } }}
          onSubmit={createPricingModelMutation.mutateAsync}
        >
          <PricingModelFormFields />
        </FormModal>
      )}
    </>
  )
}
```

---

### Phase 3: Integration & Testing

#### 3.1 Integration Points

**No changes required to:**
- ✅ TRPC router (`pricingModelsRouter.ts`) - reuses `setup` mutation
- ✅ Backend transaction logic (`setupTransaction.ts`) - already handles all cases
- ✅ Database schema - no migrations needed

**Minor changes required:**
1. Update `InnerPricingModelsPage.tsx` - already done (no changes, modal import updated)
2. Update `CreatePricingModelModal.tsx` - see Phase 2.6 above

#### 3.2 Unit Tests

**File:** `/platform/flowglad-next/src/constants/pricingModelTemplates.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import {
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
  PRICING_MODEL_TEMPLATES,
  getTemplateById,
} from './pricingModelTemplates'
import { isPricingModelTemplate } from '@/types/pricingModelTemplates'
import { validateSetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

describe('Pricing Model Templates', () => {
  describe('Template Structure Validation', () => {
    it('should have valid structure for usage-limit template', () => {
      expect(isPricingModelTemplate(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE)).toBe(true)
      expect(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.metadata.id).toBe('usage-limit-subscription')
      expect(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.metadata.features).toHaveLength(3)
    })

    it('should have valid structure for unlimited usage template', () => {
      expect(isPricingModelTemplate(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE)).toBe(true)
      expect(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.metadata.id).toBe('unlimited-usage-subscription')
      expect(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.metadata.features).toHaveLength(3)
    })

    it('should have all templates in array', () => {
      expect(PRICING_MODEL_TEMPLATES).toHaveLength(2)
      expect(PRICING_MODEL_TEMPLATES).toContain(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE)
      expect(PRICING_MODEL_TEMPLATES).toContain(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE)
    })
  })

  describe('Template Input Validation', () => {
    it('should pass setupPricingModelSchema validation for usage-limit template', () => {
      expect(() =>
        validateSetupPricingModelInput(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input)
      ).not.toThrow()
    })

    it('should pass setupPricingModelSchema validation for unlimited usage template', () => {
      expect(() =>
        validateSetupPricingModelInput(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input)
      ).not.toThrow()
    })

    it('should have correct number of products for usage-limit template', () => {
      const template = USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input
      expect(template.products).toHaveLength(4) // Hobby, Pro, Pro+, Ultra
      expect(template.products.map((p) => p.product.name)).toEqual([
        'Hobby',
        'Pro',
        'Pro+',
        'Ultra',
      ])
    })

    it('should have correct pricing for usage-limit template', () => {
      const hobbyProduct = USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.products[0]
      expect(hobbyProduct.prices[0].unitPrice).toBe(0)

      const proProduct = USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.products[1]
      expect(proProduct.prices.find((p) => p.slug === 'pro-monthly')?.unitPrice).toBe(2000)
      expect(proProduct.prices.find((p) => p.slug === 'pro-yearly')?.unitPrice).toBe(19200)
    })

    it('should have usage meters for usage-limit template', () => {
      expect(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.usageMeters).toHaveLength(3)
      expect(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.usageMeters.map((m) => m.slug)).toEqual([
        'api-requests',
        'ai-completions',
        'storage-gb',
      ])
    })

    it('should have no usage meters for unlimited usage template', () => {
      expect(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input.usageMeters).toHaveLength(0)
    })
  })

  describe('Template Lookup', () => {
    it('should find template by ID', () => {
      const template = getTemplateById('usage-limit-subscription')
      expect(template).toBeDefined()
      expect(template?.metadata.id).toBe('usage-limit-subscription')
    })

    it('should return undefined for non-existent template', () => {
      const template = getTemplateById('non-existent')
      expect(template).toBeUndefined()
    })
  })
})
```

#### 3.3 Integration Tests

**File:** `/platform/flowglad-next/src/utils/pricingModels/setupTransactionTemplates.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'
import type { Organization } from '@/db/schema/organizations'
import {
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
} from '@/constants/pricingModelTemplates'
import { selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere } from '@/db/tableMethods/pricingModelMethods'

let organization: Organization.Record

beforeEach(async () => {
  const orgData = await setupOrg()
  organization = orgData.organization
})

afterEach(async () => {
  if (organization) {
    await teardownOrg({ organizationId: organization.id })
  }
})

describe('Template Integration Tests', () => {
  it('should successfully create usage-limit subscription template', async () => {
    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        {
          input: USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    // Verify pricing model created
    expect(result.pricingModel.id).toBeDefined()
    expect(result.pricingModel.name).toBe('Usage-Limit Subscription')

    // Verify products created (4 from template + 1 auto-generated default)
    expect(result.products).toHaveLength(5)
    const productSlugs = result.products.map((p) => p.slug)
    expect(productSlugs).toContain('hobby')
    expect(productSlugs).toContain('pro')
    expect(productSlugs).toContain('pro-plus')
    expect(productSlugs).toContain('ultra')
    expect(productSlugs).toContain('free') // Auto-generated

    // Verify usage meters created
    expect(result.usageMeters).toHaveLength(3)
    const meterSlugs = result.usageMeters.map((m) => m.slug)
    expect(meterSlugs).toContain('api-requests')
    expect(meterSlugs).toContain('ai-completions')
    expect(meterSlugs).toContain('storage-gb')

    // Verify prices created correctly
    const proProduct = result.products.find((p) => p.slug === 'pro')
    expect(proProduct).toBeDefined()
    const proPrices = result.prices.filter((pr) => pr.productId === proProduct!.id)
    expect(proPrices).toHaveLength(2) // Monthly + Yearly
    expect(proPrices.some((p) => p.unitPrice === 2000)).toBe(true) // $20/month
    expect(proPrices.some((p) => p.unitPrice === 19200)).toBe(true) // $192/year
  })

  it('should successfully create unlimited usage subscription template', async () => {
    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        {
          input: UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    // Verify pricing model created
    expect(result.pricingModel.id).toBeDefined()
    expect(result.pricingModel.name).toBe('Unlimited Usage Subscription')

    // Verify products created (4 from template + 1 auto-generated default)
    expect(result.products).toHaveLength(5)
    const productSlugs = result.products.map((p) => p.slug)
    expect(productSlugs).toContain('free-unlimited')
    expect(productSlugs).toContain('plus')
    expect(productSlugs).toContain('team')
    expect(productSlugs).toContain('enterprise')

    // Verify no usage meters (unlimited model)
    expect(result.usageMeters).toHaveLength(0)

    // Verify features are toggle-only
    expect(result.features.every((f) => f.type === 'toggle')).toBe(true)
  })

  it('should handle custom template names', async () => {
    const customInput = {
      ...USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input,
      name: 'My Custom Usage Model',
    }

    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        {
          input: customInput,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    expect(result.pricingModel.name).toBe('My Custom Usage Model')
  })

  it('should create template in correct environment', async () => {
    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        {
          input: UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input,
          organizationId: organization.id,
          livemode: true, // Test livemode
        },
        transaction
      )
    )

    expect(result.pricingModel.livemode).toBe(true)
    expect(result.products.every((p) => p.livemode === true)).toBe(true)
    expect(result.prices.every((pr) => pr.livemode === true)).toBe(true)
  })
})
```

#### 3.4 Component Tests

**File:** `/platform/flowglad-next/src/components/pricing-model-templates/TemplateCard.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplateCard } from './TemplateCard'
import { Layers, RefreshCw, Clock, CreditCard } from 'lucide-react'
import type { PricingModelTemplateMetadata } from '@/types/pricingModelTemplates'

describe('TemplateCard', () => {
  const mockMetadata: PricingModelTemplateMetadata = {
    id: 'test-template',
    title: 'Test Template',
    description: 'This is a test template description',
    icon: Layers,
    features: [
      { icon: RefreshCw, text: 'Feature 1' },
      { icon: Clock, text: 'Feature 2' },
      { icon: CreditCard, text: 'Feature 3' },
    ],
    usedBy: {
      name: 'TestCo',
      logo: 'https://example.com/logo.png',
    },
  }

  const mockOnCustomize = vi.fn()

  it('should render template metadata correctly', () => {
    render(<TemplateCard metadata={mockMetadata} onCustomize={mockOnCustomize} />)

    expect(screen.getByText('Test Template')).toBeInTheDocument()
    expect(screen.getByText('This is a test template description')).toBeInTheDocument()
    expect(screen.getByText('Feature 1')).toBeInTheDocument()
    expect(screen.getByText('Feature 2')).toBeInTheDocument()
    expect(screen.getByText('Feature 3')).toBeInTheDocument()
    expect(screen.getByText('used by')).toBeInTheDocument()
  })

  it('should call onCustomize when button is clicked', () => {
    render(<TemplateCard metadata={mockMetadata} onCustomize={mockOnCustomize} />)

    const button = screen.getByText('Customize Template')
    fireEvent.click(button)

    expect(mockOnCustomize).toHaveBeenCalledTimes(1)
  })

  it('should render all three features', () => {
    render(<TemplateCard metadata={mockMetadata} onCustomize={mockOnCustomize} />)

    mockMetadata.features.forEach((feature) => {
      expect(screen.getByText(feature.text)).toBeInTheDocument()
    })
  })
})
```

---

## Template Definitions

### Usage-Limit Subscription Template

**Target Users:** SaaS products with metered usage (e.g., API calls, AI completions, storage)

**Structure:**
- **Products:** 4 tiered plans (Hobby $0, Pro $20/$192, Pro+ $60/$560, Ultra $200/$1920)
- **Usage Meters:** 3 meters (api-requests, ai-completions, storage-gb)
- **Features:** 6 total (4 usage credit grants per tier, 2 toggle features)
- **Pricing:** Monthly + Yearly options with ~20% annual discount

**Use Cases:**
- AI/ML APIs (OpenAI, Anthropic)
- Developer tools (Cursor, Vercel)
- Data platforms (Stripe, Twilio)

---

### Unlimited Usage Subscription Template

**Target Users:** SaaS products offering unlimited access at each tier

**Structure:**
- **Products:** 4 tiered plans (Free $0, Plus $20/$192, Team $50/$480, Enterprise $150/$1440)
- **Usage Meters:** None (unlimited model)
- **Features:** 5 toggle features (basic-access, advanced-features, team-collaboration, priority-access, api-access)
- **Pricing:** Monthly + Yearly options with ~20% annual discount

**Use Cases:**
- Collaboration tools (Notion, Figma)
- Content platforms (Netflix, Spotify)
- Communication tools (Slack, Zoom)

---

## Testing Strategy

### Test Pyramid

```
                    /\
                   /  \
                  / E2E \          ← Manual testing in dev environment
                 /______\
                /        \
               / Integration\       ← setupTransactionTemplates.test.ts
              /__________\
             /            \
            /  Unit Tests  \        ← pricingModelTemplates.test.ts
           /________________\       ← TemplateCard.test.tsx
```

### Test Coverage Requirements

1. **Unit Tests (>90% coverage)**
   - Template structure validation
   - Input schema validation
   - Helper function correctness
   - Component rendering

2. **Integration Tests (100% template coverage)**
   - Each template creates successfully
   - Correct number of objects created
   - Pricing calculations accurate
   - Relationships between objects valid

3. **E2E Tests (Manual for MVP)**
   - Complete user flow: Select → Preview → Create
   - Modal transitions work correctly
   - Toast notifications appear
   - Redirect to pricing model details page

### Test Commands

```bash
# Run all tests
pnpm test

# Run template-specific tests
pnpm test pricingModelTemplates

# Run integration tests
pnpm test setupTransactionTemplates

# Run component tests
pnpm test TemplateCard

# Coverage report
pnpm test:coverage
```

---

## Future Considerations

### Phase 2: Database-Backed Templates

**Database Schema:**

```sql
CREATE TABLE pricing_model_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id), -- NULL = global template
  metadata JSONB NOT NULL,
  input JSONB NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_organization ON pricing_model_templates(organization_id);
CREATE INDEX idx_templates_public ON pricing_model_templates(is_public) WHERE is_public = TRUE;
```

**Migration Path:**
1. Create `pricingModelsTemplatesRouter` TRPC router
2. Add `list`, `get`, `create`, `update` procedures
3. Migrate hardcoded templates to database via seed script
4. Update frontend to fetch from API instead of constants
5. Add admin UI for template management

**Benefits:**
- Organization-specific templates
- Template marketplace
- Dynamic template updates without deployments
- Analytics on template usage

---

### Phase 3: Advanced Features

#### 3.1 Template Search & Filtering
```typescript
interface TemplateFilters {
  category?: 'saas' | 'ecommerce' | 'api' | 'marketplace'
  priceRange?: 'free' | 'starter' | 'growth' | 'enterprise'
  hasUsageMeters?: boolean
  hasTrials?: boolean
}
```

#### 3.2 Template Customization Before Creation
- Allow users to edit template name, product names, prices before creating
- Add "Customize" step between Preview and Create
- Use FormModal with pre-filled values from template

#### 3.3 Template Analytics
- Track which templates are most popular
- A/B test template descriptions
- Suggest templates based on user's industry

#### 3.4 Community Templates
- Users can publish their pricing models as templates
- Voting/rating system
- Featured templates from successful companies

#### 3.5 Template Versioning
- Track template versions
- Notify users of updates to templates they've used
- Allow users to "upgrade" to new template version

---

## Research Questions

### Design & UX
- [ ] Should we add template categories/tags? (SaaS, E-commerce, API, Marketplace)
- [ ] Do we need a "Recently Used Templates" section?
- [ ] Should there be a "blank template" card in the grid, or keep the "New" button separate?
- [ ] What's the ideal number of templates to show before pagination is needed?
- [ ] Should template preview show actual database IDs or placeholder values?

### Technical
- [ ] What's the performance impact of large templates (10+ products)? Need benchmarks.
- [ ] Should templates be lazy-loaded or bundled in initial JS?
- [ ] Do we need template validation beyond schema validation? (e.g., business logic rules)
- [ ] Should we cache templates in localStorage for offline access?
- [ ] How do we handle template schema migrations when `SetupPricingModelInput` changes?

### Business Logic
- [ ] Should default plans generated by templates be different from auto-generated defaults?
- [ ] Do templates need to support trial periods? (Currently none have trials)
- [ ] Should templates include recommended feature flags/toggles?
- [ ] Do we need "industry-specific" templates (FinTech, HealthTech, etc.)?
- [ ] Should templates support multi-currency pricing?

### Compliance & Security
- [ ] Do template descriptions need legal review?
- [ ] Should we rate-limit template usage to prevent abuse?
- [ ] Do we need audit logs for template usage?
- [ ] Should templates be scoped by environment (testmode vs livemode)?

### Future Scaling
- [ ] At what point do we need a template CDN?
- [ ] How do we version templates without breaking existing users?
- [ ] Should templates support custom fields/metadata?
- [ ] Do we need a template preview API for external integrations?
- [ ] How do we handle deprecated templates?

---

## Implementation Checklist

### Phase 1: Data Layer
- [ ] Create `/src/types/pricingModelTemplates.ts`
- [ ] Create `/src/constants/pricingModelTemplates.ts`
- [ ] Define usage-limit subscription template
- [ ] Define unlimited usage subscription template
- [ ] Create `/src/utils/pricingModelTemplates.ts` helpers
- [ ] Write unit tests for templates
- [ ] Write integration tests for templates

### Phase 2: Components
- [ ] Create `/src/components/pricing-model-templates/` directory
- [ ] Implement `TemplateCard.tsx`
- [ ] Implement `TemplateGrid.tsx`
- [ ] Implement `TemplatePreviewModal.tsx`
- [ ] Implement `PricingModelTemplateSelector.tsx`
- [ ] Modify `CreatePricingModelModal.tsx`
- [ ] Write component tests
- [ ] Manual UI testing in dev environment

### Phase 3: Integration
- [ ] Test complete user flow (select → preview → create)
- [ ] Verify toast notifications
- [ ] Verify redirect to pricing model page
- [ ] Test error handling (network failures, validation errors)
- [ ] Test loading states
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsive testing

### Phase 4: Documentation & Deployment
- [ ] Update internal docs with template usage instructions
- [ ] Add screenshots to docs
- [ ] Create PR with detailed description
- [ ] Code review with team
- [ ] Deploy to staging environment
- [ ] QA testing in staging
- [ ] Deploy to production
- [ ] Monitor for errors in production

---

## Deployment Strategy

### Pre-Deployment
1. ✅ All tests passing
2. ✅ Linter errors resolved
3. ✅ Code reviewed by 2+ team members
4. ✅ QA testing completed in staging
5. ✅ Performance benchmarks meet targets (<2s template load time)

### Deployment
1. Merge PR to main branch
2. Vercel auto-deploys to staging
3. Run smoke tests in staging
4. Manual QA of complete flow
5. Deploy to production
6. Monitor Sentry for errors
7. Monitor analytics for template usage

### Post-Deployment
1. Announce feature to team
2. Create user-facing documentation
3. Add to changelog
4. Monitor user feedback
5. Iterate based on usage data

---

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Adoption Rate**
   - Target: 60% of new pricing models use templates
   - Metric: `(templates used / total pricing models created) * 100`

2. **Time to First Pricing Model**
   - Target: <2 minutes from signup to first pricing model
   - Metric: Average time from user creation to first pricing model

3. **Template Popularity**
   - Track which templates are most used
   - Identify patterns for future template creation

4. **Error Rate**
   - Target: <0.1% template creation failures
   - Metric: `(failed template creations / total attempts) * 100`

5. **User Satisfaction**
   - Target: >80% users find templates helpful (future survey)
   - Metric: Post-creation satisfaction survey (Phase 2)

---

## Conclusion

This implementation plan provides a comprehensive, production-ready approach to building Pricing Model Templates in the Flowglad dashboard. By following Agree's recommendation to separate display metadata from backend input, we achieve:

✅ **Type Safety** - Leverages existing `SetupPricingModelInput` with full validation
✅ **Maintainability** - Clear separation of concerns, easy to extend
✅ **Shadcn Consistency** - Matches existing design patterns and component library
✅ **Zero Backend Changes** - Reuses existing TRPC mutations and transaction logic
✅ **Comprehensive Testing** - Unit, integration, and E2E test coverage
✅ **Future-Proof** - Clear migration path to database-backed templates

The templates will significantly reduce friction for new users by providing battle-tested pricing model configurations from successful companies like Cursor and ChatGPT.

**Next Steps:**
1. Review this plan with the team
2. Address any research questions
3. Begin Phase 1 implementation
4. Iterate based on user feedback after launch

---

*Document Version: 1.0*  
*Last Updated: October 14, 2025*  
*Author: AI Assistant*  
*Reviewer: Agree (Cofounder)*

