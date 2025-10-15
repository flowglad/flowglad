import {
  Layers,
  Infinity,
  Clock,
  RefreshCw,
  CreditCard,
  Lock,
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
export const USAGE_LIMIT_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'usage-limit-subscription',
      title: 'Usage-limit subscription',
      description:
        'Perfect for SaaS products with tiered usage limits. Includes 4 plans with monthly renewals and optional on-demand credits.',
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
        logo: 'CURSOR',
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
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro-api-requests',
          name: 'API Requests - Pro',
          description: 'Monthly API request credits for Pro plan',
          usageMeterSlug: 'api-requests',
          amount: 10000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro-plus-api-requests',
          name: 'API Requests - Pro+',
          description: 'Monthly API request credits for Pro+ plan',
          usageMeterSlug: 'api-requests',
          amount: 50000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'ultra-api-requests',
          name: 'API Requests - Ultra',
          description: 'Monthly API request credits for Ultra plan',
          usageMeterSlug: 'api-requests',
          amount: 200000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
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
            description:
              'Perfect for personal projects and experimentation',
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
              unitPrice: 0,
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
              unitPrice: 2000,
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
              unitPrice: 19200,
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
              unitPrice: 6000,
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
              unitPrice: 56000,
            },
          ],
          features: [
            'pro-plus-api-requests',
            'priority-support',
            'advanced-analytics',
          ],
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
              unitPrice: 20000,
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
              unitPrice: 192000,
            },
          ],
          features: [
            'ultra-api-requests',
            'priority-support',
            'advanced-analytics',
          ],
        },
      ],
    },
  }

/**
 * Unlimited Usage Subscription Template
 * Used by: ChatGPT
 * Model: Simple tiered plans with unlimited usage for paid tiers
 */
export const UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'unlimited-usage-subscription',
      title: 'Unlimited usage subscription',
      description:
        'Simple tiered pricing with unlimited usage for paid plans. Perfect for services offering unrestricted access to features.',
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
        logo: 'CHATGPT',
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
              unitPrice: 2000,
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
              unitPrice: 19200,
            },
          ],
          features: [
            'basic-access',
            'advanced-features',
            'priority-access',
          ],
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
              unitPrice: 5000,
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
              unitPrice: 48000,
            },
          ],
          features: [
            'basic-access',
            'advanced-features',
            'priority-access',
            'team-collaboration',
          ],
        },
        {
          product: {
            name: 'Enterprise',
            default: false,
            description:
              'Full access with API and enterprise support',
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
              unitPrice: 15000,
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
              unitPrice: 144000,
            },
          ],
          features: [
            'basic-access',
            'advanced-features',
            'priority-access',
            'team-collaboration',
            'api-access',
          ],
        },
      ],
    },
  }

/**
 * All available pricing model templates
 */
export const PRICING_MODEL_TEMPLATES: ReadonlyArray<PricingModelTemplate> =
  [
    USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
    UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
  ] as const

/**
 * Get template by ID
 */
export function getTemplateById(
  id: string
): PricingModelTemplate | undefined {
  return PRICING_MODEL_TEMPLATES.find(
    (template) => template.metadata.id === id
  )
}
