import {
  Layers,
  Infinity,
  Clock,
  RefreshCw,
  CreditCard,
  Lock,
  Zap,
  Users,
  Package,
  TrendingUp,
  Boxes,
  ShoppingCart,
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
 * Model: Hybrid subscription + metered usage. Subscriptions include monthly credits; overages billed at cost.
 */
export const USAGE_LIMIT_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'usage-limit-subscription',
      title: 'Usage-limit subscription',
      description:
        'Hybrid subscription + usage model. Subscriptions include monthly usage credits; overages billed at cost. Perfect for API-intensive products.',
      icon: Layers,
      features: [
        {
          icon: RefreshCw,
          text: 'Tiered subscriptions with included usage',
        },
        {
          icon: Clock,
          text: 'Credits renew monthly',
        },
        {
          icon: CreditCard,
          text: 'Overages billed at cost',
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
        {
          slug: 'fast-premium-requests',
          name: 'Fast Premium Requests',
        },
      ],

      // Features
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'hobby-trial-requests',
          name: '250 Fast Premium Requests',
          description:
            '250 fast premium requests during 14-day trial',
          usageMeterSlug: 'fast-premium-requests',
          amount: 250,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro-fast-requests',
          name: '500 Fast Premium Requests',
          description: '500 fast premium requests included per month',
          usageMeterSlug: 'fast-premium-requests',
          amount: 500,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro-plus-fast-requests',
          name: '1,500 Fast Premium Requests',
          description:
            '1,500 fast premium requests included per month (3x)',
          usageMeterSlug: 'fast-premium-requests',
          amount: 1500,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'ultra-fast-requests',
          name: '10,000 Fast Premium Requests',
          description:
            '10,000 fast premium requests included per month (20x)',
          usageMeterSlug: 'fast-premium-requests',
          amount: 10000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited-slow-requests',
          name: 'Unlimited Slow Premium Requests',
          description: 'Unlimited slow premium model requests',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited-completions',
          name: 'Unlimited Code Completions',
          description: 'Unlimited tab completions',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'background-agents',
          name: 'Background Agents',
          description: 'Background agents for proactive suggestions',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'priority-access',
          name: 'Priority Access',
          description: 'Priority access to new features',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Hobby',
            default: true,
            description:
              'Free with 14-day Pro trial (250 fast requests)',
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
              name: 'Hobby Plan (Free)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 0,
            },
          ],
          features: ['hobby-trial-requests'],
        },
        {
          product: {
            name: 'Pro',
            default: false,
            description:
              '$20/mo + 500 fast requests included (overages at cost)',
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
              trialPeriodDays: 14,
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
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 24000,
            },
          ],
          features: [
            'pro-fast-requests',
            'unlimited-slow-requests',
            'unlimited-completions',
            'background-agents',
          ],
        },
        {
          product: {
            name: 'Pro+',
            default: false,
            description: '$60/mo + 1,500 fast requests (3x) included',
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
          ],
          features: [
            'pro-plus-fast-requests',
            'unlimited-slow-requests',
            'unlimited-completions',
            'background-agents',
          ],
        },
        {
          product: {
            name: 'Ultra',
            default: false,
            description:
              '$200/mo + 10,000 fast requests (20x) included',
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
          ],
          features: [
            'ultra-fast-requests',
            'unlimited-slow-requests',
            'unlimited-completions',
            'background-agents',
            'priority-access',
          ],
        },
        {
          product: {
            name: 'Fast Request Overages',
            default: false,
            description:
              'Additional fast requests billed at cost after included credits exhausted',
            slug: 'fast-request-overages',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: 'request',
            pluralQuantityLabel: 'requests',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'fast-request-overage',
              isDefault: true,
              name: 'Fast Request Overage',
              usageMeterSlug: 'fast-premium-requests',
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 10,
            },
          ],
          features: [],
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
            default: true,
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
 * Pay-As-You-Go Template
 * Used by: AWS
 * Model: Pure consumption-based pricing without subscriptions
 */
export const PAY_AS_YOU_GO_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'pay-as-you-go',
    title: 'Pay-as-you-go',
    description:
      'Pure consumption-based pricing. Pay only for what you use with no subscriptions or commitments.',
    icon: Zap,
    features: [
      {
        icon: TrendingUp,
        text: 'Pay only for actual usage',
      },
      {
        icon: Clock,
        text: 'No monthly commitments',
      },
      {
        icon: CreditCard,
        text: 'Metered billing per resource',
      },
    ],
    usedBy: {
      name: 'AWS',
      logo: 'AWS',
    },
  },
  input: {
    name: 'Pay-As-You-Go',
    isDefault: false,

    // Usage Meters
    usageMeters: [
      { slug: 'compute-hours', name: 'Compute Hours' },
      { slug: 'storage-gb', name: 'Storage (GB)' },
      { slug: 'bandwidth-gb', name: 'Bandwidth (GB)' },
    ],

    // Features
    features: [
      {
        type: FeatureType.Toggle,
        slug: 'resource-access',
        name: 'Resource Access',
        description: 'Access to cloud resources',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'monitoring',
        name: 'Monitoring & Analytics',
        description: 'Real-time monitoring and analytics',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'support',
        name: 'Basic Support',
        description: 'Email and documentation support',
        active: true,
      },
    ],

    // Products
    products: [
      {
        product: {
          name: 'Free',
          default: true,
          description: 'Get started with basic access',
          slug: 'free',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free-monthly',
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
        features: ['resource-access'],
      },
      {
        product: {
          name: 'Compute',
          default: false,
          description: 'Pay per compute hour',
          slug: 'compute',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'hour',
          pluralQuantityLabel: 'hours',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'compute-usage',
            isDefault: true,
            name: 'Compute Usage',
            usageMeterSlug: 'compute-hours',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 50,
          },
        ],
        features: ['resource-access', 'monitoring', 'support'],
      },
      {
        product: {
          name: 'Storage',
          default: false,
          description: 'Pay per GB stored',
          slug: 'storage',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'GB',
          pluralQuantityLabel: 'GB',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'storage-usage',
            isDefault: true,
            name: 'Storage Usage',
            usageMeterSlug: 'storage-gb',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 10,
          },
        ],
        features: ['resource-access', 'monitoring'],
      },
      {
        product: {
          name: 'Bandwidth',
          default: false,
          description: 'Pay per GB transferred',
          slug: 'bandwidth',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'GB',
          pluralQuantityLabel: 'GB',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'bandwidth-usage',
            isDefault: true,
            name: 'Bandwidth Usage',
            usageMeterSlug: 'bandwidth-gb',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 15,
          },
        ],
        features: ['resource-access', 'monitoring'],
      },
    ],
  },
}

/**
 * Freemium with Add-ons Template
 * Used by: Slack
 * Model: Free tier with optional one-time or recurring add-ons
 */
export const FREEMIUM_WITH_ADDONS_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'freemium-with-addons',
    title: 'Freemium with add-ons',
    description:
      'Start free and add features as you grow. Perfect for products with optional premium capabilities and capacity upgrades.',
    icon: Package,
    features: [
      {
        icon: RefreshCw,
        text: 'Free tier with paid upgrades',
      },
      {
        icon: Boxes,
        text: 'Optional feature add-ons',
      },
      {
        icon: ShoppingCart,
        text: 'One-time or recurring purchases',
      },
    ],
    usedBy: {
      name: 'Slack',
      logo: 'SLACK',
    },
  },
  input: {
    name: 'Freemium with Add-ons',
    isDefault: false,

    // Usage Meters
    usageMeters: [
      { slug: 'message-history', name: 'Message History (days)' },
      { slug: 'storage-gb', name: 'Storage (GB)' },
    ],

    // Features
    features: [
      {
        type: FeatureType.Toggle,
        slug: 'basic-messaging',
        name: 'Basic Messaging',
        description: 'Send and receive messages',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'integrations',
        name: 'Integrations',
        description: 'Connect third-party apps',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'advanced-search',
        name: 'Advanced Search',
        description: 'Search through all message history',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'admin-controls',
        name: 'Admin Controls',
        description: 'Advanced administration features',
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'free-storage',
        name: 'Free Storage',
        description: '5GB of free storage',
        usageMeterSlug: 'storage-gb',
        amount: 5,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        active: true,
      },
    ],

    // Products
    products: [
      {
        product: {
          name: 'Free',
          default: true,
          description: 'Get started with essential features',
          slug: 'free-tier',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free-plan',
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
        features: ['basic-messaging', 'free-storage'],
      },
      {
        product: {
          name: 'Extra Storage',
          default: false,
          description: 'Add 10GB of storage',
          slug: 'extra-storage',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'pack',
          pluralQuantityLabel: 'packs',
        },
        prices: [
          {
            type: PriceType.SinglePayment,
            slug: 'storage-addon',
            isDefault: true,
            name: 'Storage Add-on (10GB)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: null,
            intervalCount: null,
            unitPrice: 500,
          },
        ],
        features: [],
      },
      {
        product: {
          name: 'Advanced Features',
          default: false,
          description: 'Unlock advanced search and admin controls',
          slug: 'advanced-addon',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'advanced-monthly',
            isDefault: true,
            name: 'Advanced Features (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 800,
          },
        ],
        features: [
          'basic-messaging',
          'integrations',
          'advanced-search',
          'admin-controls',
        ],
      },
    ],
  },
}

/**
 * Seat-Based Subscription Template
 * Used by: GitHub
 * Model: Per-user pricing with tiered features
 */
export const SEAT_BASED_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'seat-based-subscription',
      title: 'Seat-based subscription',
      description:
        'Price scales with team size. Perfect for collaborative tools where each user needs their own account.',
      icon: Users,
      features: [
        {
          icon: Users,
          text: 'Per-user/seat pricing',
        },
        {
          icon: RefreshCw,
          text: 'Monthly or yearly billing',
        },
        {
          icon: Lock,
          text: 'Team collaboration features',
        },
      ],
      usedBy: {
        name: 'GitHub',
        logo: 'GITHUB',
      },
    },
    input: {
      name: 'Seat-Based Subscription',
      isDefault: false,

      // No usage meters
      usageMeters: [],

      // Features
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'public-repos',
          name: 'Public Repositories',
          description: 'Create unlimited public repositories',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'private-repos',
          name: 'Private Repositories',
          description: 'Create unlimited private repositories',
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
          slug: 'advanced-security',
          name: 'Advanced Security',
          description: 'Security scanning and alerts',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'priority-support',
          name: 'Priority Support',
          description: '24/7 priority support',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'sso',
          name: 'SSO & SAML',
          description: 'Single sign-on and SAML authentication',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Free',
            default: true,
            description: 'For individual developers',
            slug: 'free',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'free-monthly',
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
          features: ['public-repos'],
        },
        {
          product: {
            name: 'Team',
            default: false,
            description: 'For small teams getting started',
            slug: 'team-seat',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'team-seat-monthly',
              isDefault: true,
              name: 'Team (per user/month)',
              usageMeterId: null,
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 400,
            },
            {
              type: PriceType.Subscription,
              slug: 'team-seat-yearly',
              isDefault: false,
              name: 'Team (per user/year)',
              usageMeterId: null,
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 4000,
            },
          ],
          features: ['private-repos', 'team-collaboration'],
        },
        {
          product: {
            name: 'Business',
            default: false,
            description: 'For growing businesses',
            slug: 'business-seat',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'business-seat-monthly',
              isDefault: true,
              name: 'Business (per user/month)',
              usageMeterId: null,
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 2100,
            },
            {
              type: PriceType.Subscription,
              slug: 'business-seat-yearly',
              isDefault: false,
              name: 'Business (per user/year)',
              usageMeterId: null,
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 21000,
            },
          ],
          features: [
            'private-repos',
            'team-collaboration',
            'advanced-security',
            'priority-support',
          ],
        },
        {
          product: {
            name: 'Enterprise',
            default: false,
            description: 'For large organizations',
            slug: 'enterprise-seat',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'enterprise-seat-monthly',
              isDefault: true,
              name: 'Enterprise (per user/month)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 4500,
            },
            {
              type: PriceType.Subscription,
              slug: 'enterprise-seat-yearly',
              isDefault: false,
              name: 'Enterprise (per user/year)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 45000,
            },
          ],
          features: [
            'private-repos',
            'team-collaboration',
            'advanced-security',
            'priority-support',
            'sso',
          ],
        },
      ],
    },
  }

/**
 * Tiered Volume Pricing Template
 * Used by: Twilio
 * Model: Unit pricing decreases with volume tiers
 */
export const TIERED_VOLUME_PRICING_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'tiered-volume-pricing',
    title: 'Tiered volume pricing',
    description:
      'Pay less per unit as you scale. Perfect for high-volume usage where price per unit decreases at higher tiers.',
    icon: TrendingUp,
    features: [
      {
        icon: Layers,
        text: 'Volume-based pricing tiers',
      },
      {
        icon: TrendingUp,
        text: 'Lower unit cost at scale',
      },
      {
        icon: Zap,
        text: 'Usage-based billing',
      },
    ],
    usedBy: {
      name: 'Twilio',
      logo: 'TWILIO',
    },
  },
  input: {
    name: 'Tiered Volume Pricing',
    isDefault: false,

    // Usage Meters
    usageMeters: [
      { slug: 'api-calls', name: 'API Calls' },
      { slug: 'sms-messages', name: 'SMS Messages' },
      { slug: 'phone-minutes', name: 'Phone Minutes' },
    ],

    // Features
    features: [
      {
        type: FeatureType.Toggle,
        slug: 'api-access',
        name: 'API Access',
        description: 'Full API access',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'analytics',
        name: 'Analytics Dashboard',
        description: 'Real-time usage analytics',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'support',
        name: '24/7 Support',
        description: 'Round-the-clock technical support',
        active: true,
      },
    ],

    // Products
    products: [
      {
        product: {
          name: 'Free',
          default: true,
          description: 'Get started for free',
          slug: 'free',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free-monthly',
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
        features: ['api-access'],
      },
      {
        product: {
          name: 'API Calls - Tier 1',
          default: false,
          description: 'First 10,000 calls',
          slug: 'api-tier-1',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'call',
          pluralQuantityLabel: 'calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-tier-1-usage',
            isDefault: true,
            name: 'API Calls Tier 1',
            usageMeterSlug: 'api-calls',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 10,
          },
        ],
        features: ['api-access', 'analytics', 'support'],
      },
      {
        product: {
          name: 'API Calls - Tier 2',
          default: false,
          description: 'Next 40,000 calls at reduced rate',
          slug: 'api-tier-2',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'call',
          pluralQuantityLabel: 'calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-tier-2-usage',
            isDefault: true,
            name: 'API Calls Tier 2',
            usageMeterSlug: 'api-calls',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 7,
          },
        ],
        features: ['api-access', 'analytics', 'support'],
      },
      {
        product: {
          name: 'API Calls - Tier 3',
          default: false,
          description: '50,000+ calls at lowest rate',
          slug: 'api-tier-3',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'call',
          pluralQuantityLabel: 'calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-tier-3-usage',
            isDefault: true,
            name: 'API Calls Tier 3',
            usageMeterSlug: 'api-calls',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 5,
          },
        ],
        features: ['api-access', 'analytics', 'support'],
      },
    ],
  },
}

/**
 * Hybrid Subscription + Usage Template
 * Used by: Stripe
 * Model: Base subscription fee plus metered usage charges
 */
export const HYBRID_SUBSCRIPTION_USAGE_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'hybrid-subscription-usage',
      title: 'Hybrid subscription + usage',
      description:
        'Base subscription with usage-based charges. Perfect for platforms that combine fixed costs with variable usage.',
      icon: Layers,
      features: [
        {
          icon: RefreshCw,
          text: 'Monthly base subscription',
        },
        {
          icon: Zap,
          text: 'Additional usage charges',
        },
        {
          icon: TrendingUp,
          text: 'Scales with customer growth',
        },
      ],
      usedBy: {
        name: 'Stripe',
        logo: 'STRIPE',
      },
    },
    input: {
      name: 'Hybrid Subscription + Usage',
      isDefault: false,

      // Usage Meters
      usageMeters: [
        { slug: 'transactions', name: 'Transactions' },
        { slug: 'active-accounts', name: 'Active Accounts' },
      ],

      // Features
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'platform-access',
          name: 'Platform Access',
          description: 'Access to the platform',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'reporting',
          name: 'Reporting & Analytics',
          description: 'Comprehensive reporting tools',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'api-integrations',
          name: 'API Integrations',
          description: 'Connect with third-party services',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'premium-support',
          name: 'Premium Support',
          description: 'Priority customer support',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Free',
            default: true,
            description: 'Get started with basic features',
            slug: 'free',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'free-monthly',
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
          features: ['platform-access'],
        },
        {
          product: {
            name: 'Starter Plan',
            default: false,
            description: 'Base subscription with included usage',
            slug: 'starter-hybrid',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'starter-base-monthly',
              isDefault: true,
              name: 'Starter Base (Monthly)',
              usageMeterId: null,
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 2900,
            },
          ],
          features: ['platform-access', 'reporting'],
        },
        {
          product: {
            name: 'Transaction Fee',
            default: false,
            description: 'Per transaction usage fee',
            slug: 'transaction-usage',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: 'transaction',
            pluralQuantityLabel: 'transactions',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'transaction-fee',
              isDefault: true,
              name: 'Transaction Usage Fee',
              usageMeterSlug: 'transactions',
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 29,
            },
          ],
          features: [],
        },
        {
          product: {
            name: 'Pro Plan',
            default: false,
            description: 'Higher tier with more included usage',
            slug: 'pro-hybrid',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro-base-monthly',
              isDefault: true,
              name: 'Pro Base (Monthly)',
              usageMeterId: null,
              trialPeriodDays: 14,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 9900,
            },
          ],
          features: [
            'platform-access',
            'reporting',
            'api-integrations',
            'premium-support',
          ],
        },
      ],
    },
  }

/**
 * Credits Pack Template
 * Used by: OpenAI
 * Model: Purchase credit packs that don't expire
 */
export const CREDITS_PACK_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'credits-pack',
    title: 'Credits pack',
    description:
      'Buy credits in bulk, use them over time. Perfect for products where customers prefer upfront purchases without recurring commitments.',
    icon: CreditCard,
    features: [
      {
        icon: Package,
        text: 'Prepaid credit bundles',
      },
      {
        icon: Infinity,
        text: 'Credits never expire',
      },
      {
        icon: ShoppingCart,
        text: 'One-time purchases',
      },
    ],
    usedBy: {
      name: 'OpenAI',
      logo: 'OPENAI',
    },
  },
  input: {
    name: 'Credits Pack',
    isDefault: false,

    // Usage Meters
    usageMeters: [
      { slug: 'ai-credits', name: 'AI Credits' },
      { slug: 'api-tokens', name: 'API Tokens' },
    ],

    // Features
    features: [
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'free-credits',
        name: 'Free Credits',
        description: '10 AI credits',
        usageMeterSlug: 'ai-credits',
        amount: 10,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'starter-credits',
        name: 'Starter Credits',
        description: '100 AI credits',
        usageMeterSlug: 'ai-credits',
        amount: 100,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'pro-credits',
        name: 'Pro Credits',
        description: '500 AI credits',
        usageMeterSlug: 'ai-credits',
        amount: 500,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'enterprise-credits',
        name: 'Enterprise Credits',
        description: '2000 AI credits',
        usageMeterSlug: 'ai-credits',
        amount: 2000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'api-access',
        name: 'API Access',
        description: 'Full API access',
        active: true,
      },
    ],

    // Products
    products: [
      {
        product: {
          name: 'Free',
          default: true,
          description: '10 free credits to get started',
          slug: 'free',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free-monthly',
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
        features: ['free-credits', 'api-access'],
      },
      {
        product: {
          name: 'Starter Pack',
          default: false,
          description: '100 credits for $10',
          slug: 'starter-pack',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'pack',
          pluralQuantityLabel: 'packs',
        },
        prices: [
          {
            type: PriceType.SinglePayment,
            slug: 'starter-pack-price',
            isDefault: true,
            name: 'Starter Pack (100 credits)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: null,
            intervalCount: null,
            unitPrice: 1000,
          },
        ],
        features: ['starter-credits', 'api-access'],
      },
      {
        product: {
          name: 'Pro Pack',
          default: false,
          description: '500 credits for $40 (20% savings)',
          slug: 'pro-pack',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'pack',
          pluralQuantityLabel: 'packs',
        },
        prices: [
          {
            type: PriceType.SinglePayment,
            slug: 'pro-pack-price',
            isDefault: true,
            name: 'Pro Pack (500 credits)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: null,
            intervalCount: null,
            unitPrice: 4000,
          },
        ],
        features: ['pro-credits', 'api-access'],
      },
      {
        product: {
          name: 'Enterprise Pack',
          default: false,
          description: '2000 credits for $120 (40% savings)',
          slug: 'enterprise-pack',
          active: true,
          imageURL: null,
          displayFeatures: null,
          singularQuantityLabel: 'pack',
          pluralQuantityLabel: 'packs',
        },
        prices: [
          {
            type: PriceType.SinglePayment,
            slug: 'enterprise-pack-price',
            isDefault: true,
            name: 'Enterprise Pack (2000 credits)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: null,
            intervalCount: null,
            unitPrice: 12000,
          },
        ],
        features: ['enterprise-credits', 'api-access'],
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
    PAY_AS_YOU_GO_TEMPLATE,
    FREEMIUM_WITH_ADDONS_TEMPLATE,
    SEAT_BASED_SUBSCRIPTION_TEMPLATE,
    TIERED_VOLUME_PRICING_TEMPLATE,
    HYBRID_SUBSCRIPTION_USAGE_TEMPLATE,
    CREDITS_PACK_TEMPLATE,
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
