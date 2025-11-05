import {
  Infinity,
  Lock,
  Repeat,
  Users,
  PieChart,
  SquarePlus,
  Recycle,
  Clock,
  Zap,
  Image,
  UserPlus,
  Shield,
  Layers,
  Activity,
  Database,
  TrendingUp,
  Sparkles,
  Coins,
  Radio,
} from 'lucide-react'
import { UsageLimitIcon } from '@/components/icons/UsageLimitIcon'
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
      id: 'usage_limit_subscription',
      title: 'Usage-limit subscription',
      description:
        'Hybrid subscription + usage model. Subscriptions include monthly usage credits; overages billed at cost. Perfect for API-intensive products.',
      icon: UsageLimitIcon as any,
      features: [
        {
          icon: Repeat,
          text: '4 plans with tiered usage-limits',
        },
        {
          icon: PieChart,
          text: 'Usage credits renew monthly',
        },
        {
          icon: SquarePlus,
          text: 'Optional on-demand credits',
        },
      ],
      usedBy: {
        name: 'Cursor',
        logo: {
          svg: '<svg width="77" height="25" viewBox="0 0 77 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.8098 8.2871L11.379 4.58908C11.1725 4.47031 10.9177 4.47031 10.7112 4.58908L4.28077 8.2871C4.10717 8.38694 4 8.57157 4 8.77153V16.2286C4 16.4283 4.10717 16.6132 4.28077 16.713L10.7115 20.4111C10.918 20.5298 11.1728 20.5298 11.3793 20.4111L17.8101 16.713C17.9837 16.6132 18.0908 16.4286 18.0908 16.2286V8.77153C18.0908 8.57187 17.9837 8.38694 17.8101 8.2871H17.8098ZM17.4058 9.07043L11.1979 19.7802C11.1559 19.8524 11.0451 19.8229 11.0451 19.7393V12.7267C11.0451 12.5865 10.9699 12.4569 10.848 12.3866L4.75082 8.88039C4.67837 8.83859 4.70795 8.72823 4.79188 8.72823H17.2078C17.3841 8.72823 17.4943 8.91858 17.4061 9.07073H17.4058V9.07043Z" fill="black"/><path d="M32.1094 13.4014C32.1094 14.6368 32.6773 15.2139 34.0107 15.2139C35.3441 15.2138 35.912 14.6371 35.9121 13.4014V8.44727H37.6055V13.7471C37.6055 15.5486 36.4573 16.6924 34.0107 16.6924C31.5642 16.6924 30.4161 15.5377 30.416 13.7363V8.44727H32.1094V13.4014Z" fill="black"/><path fill-rule="evenodd" clip-rule="evenodd" d="M59.5068 8.30762C62.0576 8.30762 63.6699 9.93593 63.6699 12.4883C63.6699 15.0406 61.9882 16.6924 59.4375 16.6924C56.8869 16.6923 55.2754 15.0405 55.2754 12.4883C55.2754 9.93604 56.9563 8.30776 59.5068 8.30762ZM59.4717 9.78613C58.0225 9.78635 57.0254 10.791 57.0254 12.5C57.0255 14.2088 58.0226 15.2136 59.4717 15.2139C60.921 15.2139 61.9188 14.209 61.9189 12.5C61.9189 10.7908 60.9211 9.78613 59.4717 9.78613Z" fill="black"/><path d="M29.0244 9.94824H26.3809C24.9547 9.94824 23.8418 10.7686 23.8418 12.501C23.842 14.233 24.9548 15.0527 26.3809 15.0527H29.0244V16.5547H26.1719C23.7835 16.5546 22.0909 15.1569 22.0908 12.501C22.0908 9.8449 23.8995 8.44728 26.2881 8.44727H29.0244V9.94824Z" fill="black"/><path d="M54.2656 9.90234H50.2305C49.6512 9.90249 49.2804 10.2023 49.2803 10.7793C49.2803 11.3565 49.6625 11.6342 50.2422 11.6807L52.1562 11.8428C53.6053 11.9698 54.5555 12.6278 54.5557 14.1748C54.5557 15.7222 53.5473 16.5547 52.1211 16.5547H47.7842V15.0996H51.959C52.5037 15.0995 52.8516 14.7292 52.8516 14.1865C52.8515 13.6092 52.4802 13.3663 51.9238 13.3203L50.0459 13.1475C48.4227 12.9974 47.5763 12.362 47.5762 10.8262C47.5762 9.29019 48.6196 8.44727 50.1152 8.44727H54.2656V9.90234Z" fill="black"/><path fill-rule="evenodd" clip-rule="evenodd" d="M43.9004 8.44727C45.431 8.44727 46.4512 9.22056 46.4512 10.7451C46.451 11.6457 45.93 12.3382 45.2344 12.6387V12.6621C45.9647 12.7663 46.3352 13.2858 46.3467 13.9902L46.3818 16.5537H44.6895L44.6543 14.2676C44.6428 13.7594 44.3412 13.4473 43.7383 13.4473H40.9209V16.5537H39.2285V8.44727H43.9004ZM40.9209 12.0498H43.7031C44.3407 12.0498 44.7471 11.6687 44.7471 10.9756C44.7469 10.2831 44.376 9.90243 43.6807 9.90234H40.9209V12.0498Z" fill="black"/><path fill-rule="evenodd" clip-rule="evenodd" d="M69.5137 8.44727C71.0441 8.44737 72.0645 9.22066 72.0645 10.7451C72.0643 11.6458 71.5424 12.3383 70.8467 12.6387V12.6621C71.5772 12.7662 71.9485 13.2857 71.96 13.9902L71.9941 16.5537H70.3018L70.2666 14.2676C70.2551 13.7594 69.9535 13.4473 69.3506 13.4473H66.5332V16.5537H64.8408V8.44727H69.5137ZM66.5332 12.0498H69.3164C69.9537 12.0496 70.3594 11.6685 70.3594 10.9756C70.3592 10.283 69.9884 9.90234 69.293 9.90234H66.5332V12.0498Z" fill="black"/></svg>',
        },
      },
    },
    input: {
      name: 'Usage-Limit Subscription',
      isDefault: false,

      // Usage Meters
      usageMeters: [
        {
          slug: 'fast_premium_requests',
          name: 'Fast Premium Requests',
        },
      ],

      // Features
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'hobby_trial_requests',
          name: '250 Fast Premium Requests',
          description:
            '250 fast premium requests during 14-day trial',
          usageMeterSlug: 'fast_premium_requests',
          amount: 250,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro_fast_requests',
          name: '500 Fast Premium Requests',
          description: '500 fast premium requests included per month',
          usageMeterSlug: 'fast_premium_requests',
          amount: 500,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro_plus_fast_requests',
          name: '1,500 Fast Premium Requests',
          description:
            '1,500 fast premium requests included per month (3x)',
          usageMeterSlug: 'fast_premium_requests',
          amount: 1500,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'ultra_fast_requests',
          name: '10,000 Fast Premium Requests',
          description:
            '10,000 fast premium requests included per month (20x)',
          usageMeterSlug: 'fast_premium_requests',
          amount: 10000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_slow_requests',
          name: 'Unlimited Slow Premium Requests',
          description: 'Unlimited slow premium model requests',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_completions',
          name: 'Unlimited Code Completions',
          description: 'Unlimited tab completions',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'background_agents',
          name: 'Background Agents',
          description: 'Background agents for proactive suggestions',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'priority_access',
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
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'hobby_monthly',
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
          features: ['hobby_trial_requests'],
        },
        {
          product: {
            name: 'Pro',
            default: false,
            description:
              '$20/mo + 500 fast requests included (overages at cost)',
            slug: 'pro_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro_monthly',
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
          ],
          features: [
            'pro_fast_requests',
            'unlimited_slow_requests',
            'unlimited_completions',
            'background_agents',
          ],
          displayGroup: 'pro',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Pro',
            default: false,
            description: '$240/yr + 500 fast requests included',
            slug: 'pro_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro_yearly',
              isDefault: true,
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
            'pro_fast_requests',
            'unlimited_slow_requests',
            'unlimited_completions',
            'background_agents',
          ],
          displayGroup: 'pro',
          displayOrder: 2,
        },
        {
          product: {
            name: 'Pro+',
            default: false,
            description: '$60/mo + 1,500 fast requests (3x) included',
            slug: 'pro_plus',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro_plus_monthly',
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
            'pro_plus_fast_requests',
            'unlimited_slow_requests',
            'unlimited_completions',
            'background_agents',
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
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'ultra_monthly',
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
            'ultra_fast_requests',
            'unlimited_slow_requests',
            'unlimited_completions',
            'background_agents',
            'priority_access',
          ],
        },
        {
          product: {
            name: 'Fast Request Overages',
            default: false,
            description:
              'Additional fast requests billed at cost after included credits exhausted',
            slug: 'fast_request_overages',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'request',
            pluralQuantityLabel: 'requests',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'fast_request_overage',
              isDefault: true,
              name: 'Fast Request Overage',
              usageMeterSlug: 'fast_premium_requests',
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
 * Tiered Usage-Gated Subscription Template
 * Used by: ChatGPT
 * Model: Tiered subscriptions with per-plan usage limits and feature access. Different model quotas and context windows by tier.
 */
export const UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'unlimited_usage_subscription',
      title: 'Unlimited* usage subscription',
      description:
        'Tiered subscription plans with usage gates and feature access by tier. Model quotas, context windows, and capabilities vary by plan level.',
      icon: Infinity,
      features: [
        {
          icon: Repeat,
          text: '4 plans with unlimited / generous usage',
        },
        {
          icon: Lock,
          text: 'Feature gates by subscription tier',
        },
        {
          icon: Users,
          text: 'Individual to multi-seat plans',
        },
      ],
      usedBy: {
        name: 'ChatGPT',
        logo: {
          svg: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.19198 7.82397V6.30397C8.19198 6.17595 8.24003 6.07991 8.35197 6.01599L11.4081 4.25599C11.8241 4.016 12.3201 3.90406 12.832 3.90406C14.752 3.90406 15.9681 5.39209 15.9681 6.97602C15.9681 7.088 15.9681 7.21601 15.952 7.34403L12.784 5.48799C12.592 5.37605 12.3999 5.37605 12.208 5.48799L8.19198 7.82397ZM15.328 13.744V10.1119C15.328 9.88789 15.2319 9.7279 15.04 9.61592L11.024 7.27993L12.336 6.52788C12.448 6.46396 12.544 6.46396 12.656 6.52788L15.712 8.28788C16.5921 8.79995 17.184 9.88789 17.184 10.9438C17.184 12.1598 16.4641 13.2798 15.328 13.7439V13.744ZM7.24799 10.544L5.93599 9.77608C5.82405 9.71216 5.776 9.61609 5.776 9.48807V5.9681C5.776 4.25616 7.088 2.96006 8.86404 2.96006C9.53612 2.96006 10.16 3.18412 10.6881 3.5841L7.53613 5.40816C7.34419 5.5201 7.24816 5.6801 7.24816 5.90418V10.5442L7.24799 10.544ZM10.072 12.176L8.19198 11.12V8.88011L10.072 7.82414L11.9519 8.88011V11.12L10.072 12.176ZM11.28 17.0401C10.608 17.0401 9.98409 16.816 9.45596 16.4161L12.6079 14.592C12.7999 14.48 12.8959 14.32 12.8959 14.096V9.45596L14.224 10.2239C14.3359 10.2878 14.384 10.3839 14.384 10.5119V14.0319C14.384 15.7438 13.0559 17.0399 11.28 17.0399V17.0401ZM7.48798 13.4721L4.43189 11.7121C3.55182 11.2 2.9599 10.1121 2.9599 9.05614C2.9599 7.82414 3.69591 6.72016 4.83184 6.25611V9.9041C4.83184 10.1281 4.92791 10.2881 5.11985 10.4001L9.11993 12.72L7.80794 13.4721C7.69599 13.536 7.59992 13.536 7.48798 13.4721ZM7.31208 16.0961C5.50406 16.0961 4.17603 14.7361 4.17603 13.0561C4.17603 12.928 4.19206 12.8 4.20797 12.672L7.35997 14.4961C7.5519 14.608 7.74401 14.608 7.93595 14.4961L11.9519 12.1762V13.6962C11.9519 13.8242 11.9039 13.9202 11.7919 13.9841L8.73589 15.7441C8.31986 15.9841 7.82384 16.0961 7.31191 16.0961H7.31208ZM11.28 18C13.2161 18 14.832 16.624 15.2001 14.8C16.9921 14.3359 18.1441 12.6559 18.1441 10.944C18.1441 9.82393 17.6641 8.73602 16.8001 7.95199C16.8801 7.61596 16.9281 7.27994 16.9281 6.94407C16.9281 4.65611 15.0721 2.94399 12.928 2.94399C12.4961 2.94399 12.0801 3.00792 11.6641 3.152C10.944 2.44797 9.95198 2 8.86404 2C6.92803 2 5.31212 3.37592 4.94398 5.19998C3.152 5.66402 2 7.34403 2 9.05598C2 10.176 2.47995 11.2639 3.34398 12.048C3.26398 12.384 3.21596 12.72 3.21596 13.0559C3.21596 15.3439 5.072 17.056 7.21601 17.056C7.64794 17.056 8.06397 16.9921 8.47999 16.848C9.19993 17.552 10.1919 18 11.28 18Z" fill="black"/></svg>',
          text: 'ChatGPT',
        },
      },
    },
    input: {
      name: 'Unlimited Usage Subscription',
      isDefault: false,

      // Usage Meters
      usageMeters: [
        {
          slug: 'gpt_5_thinking_messages',
          name: 'GPT-5 Thinking Messages',
        },
        { slug: 'o3_messages', name: 'o3 Messages' },
        { slug: 'o4_mini_messages', name: 'o4-mini Messages' },
        {
          slug: 'o4_mini_high_messages',
          name: 'o4-mini-high Messages',
        },
        { slug: 'agent_messages', name: 'Agent Mode Messages' },
        {
          slug: 'deep_research_requests',
          name: 'Deep Research Requests',
        },
      ],

      // Features
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'gpt_5_fast',
          name: 'GPT-5 Fast/Instant',
          description:
            'Access to GPT-5 Fast and Instant models with rate limits',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'gpt_5_thinking',
          name: 'GPT-5 Thinking',
          description:
            'Access to GPT-5 Thinking model with 196K context window',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'gpt_5_thinking_plus_limit',
          name: '3,000 GPT-5 Thinking Messages/Week',
          description:
            '3,000 GPT-5 Thinking messages per week (manual selection only)',
          usageMeterSlug: 'gpt_5_thinking_messages',
          amount: 3000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'o3_access',
          name: 'o3 Model Access',
          description: 'Access to o3 reasoning model',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'o3_limit',
          name: '100 o3 Messages/Week',
          description: '100 o3 messages per week',
          usageMeterSlug: 'o3_messages',
          amount: 100,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'o4_mini_access',
          name: 'o4-mini Model Access',
          description: 'Access to o4-mini reasoning model',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'o4_mini_limit',
          name: '300 o4-mini Messages/Day',
          description: '300 o4-mini messages per day',
          usageMeterSlug: 'o4_mini_messages',
          amount: 300,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'o4_mini_high_access',
          name: 'o4-mini-high Model Access',
          description: 'Access to o4-mini-high reasoning model',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'o4_mini_high_limit',
          name: '100 o4-mini-high Messages/Day',
          description: '100 o4-mini-high messages per day',
          usageMeterSlug: 'o4_mini_high_messages',
          amount: 100,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'context_16k',
          name: '16K Context Window',
          description:
            '16K token context window for GPT-5 Fast/Instant',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'context_32k',
          name: '32K Context Window',
          description:
            '32K token context window for GPT-5 Fast/Instant',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'context_128k',
          name: '128K Context Window',
          description:
            '128K token context window for GPT-5 Fast/Instant',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'context_196k',
          name: '196K Context Window',
          description: '196K token context window for GPT-5 Thinking',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'web_search',
          name: 'Real-time Web Search',
          description: 'Real-time data retrieval from the web',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'file_uploads',
          name: 'File Uploads & Analysis',
          description: 'Upload and analyze files',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'voice_mode',
          name: 'Voice Mode',
          description: 'Voice interaction with video & screensharing',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'code_editing',
          name: 'Code Editing',
          description: 'Edit code using the macOS desktop app',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'custom_gpts',
          name: 'Custom GPTs',
          description: 'Create and use custom GPTs',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'projects',
          name: 'Projects',
          description: 'Create and use projects',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'agent_mode',
          name: 'Agent Mode',
          description: 'ChatGPT Agent for complex tasks',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'agent_limit_standard',
          name: '40 Agent Messages/Month',
          description: '40 agent mode messages per month',
          usageMeterSlug: 'agent_messages',
          amount: 40,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'agent_limit_pro',
          name: '400 Agent Messages/Month',
          description: '400 agent mode messages per month',
          usageMeterSlug: 'agent_messages',
          amount: 400,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'deep_research',
          name: 'Deep Research',
          description: 'Access to deep research feature',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'deep_research_limit',
          name: '25 Deep Research Requests/Month',
          description: '25 deep research requests per month',
          usageMeterSlug: 'deep_research_requests',
          amount: 25,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'workspace_admin',
          name: 'Workspace & Admin Controls',
          description:
            'Model picker and admin controls for organization',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Free',
            default: true,
            description:
              'GPT-5 Fast/Instant with 16K context and rate limits',
            slug: 'free_tier',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'free_monthly',
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
          features: [
            'gpt_5_fast',
            'context_16k',
            'web_search',
            'file_uploads',
            'voice_mode',
            'code_editing',
            'custom_gpts',
            'projects',
          ],
        },
        {
          product: {
            name: 'Plus',
            default: false,
            description:
              '$20/mo with GPT-5 Thinking (3K/wk), o3 (100/wk), o4-mini (300/day), Agent (40/mo), 32K context',
            slug: 'plus',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'plus_monthly',
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
          ],
          features: [
            'gpt_5_fast',
            'gpt_5_thinking',
            'gpt_5_thinking_plus_limit',
            'o3_access',
            'o3_limit',
            'o4_mini_access',
            'o4_mini_limit',
            'o4_mini_high_access',
            'o4_mini_high_limit',
            'context_32k',
            'context_196k',
            'web_search',
            'file_uploads',
            'voice_mode',
            'code_editing',
            'custom_gpts',
            'projects',
            'agent_mode',
            'agent_limit_standard',
          ],
        },
        {
          product: {
            name: 'Pro',
            default: false,
            description:
              '$200/mo with unlimited o-models, Agent (400/mo), 128K context for Fast, 196K for Thinking',
            slug: 'pro',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro_monthly',
              isDefault: true,
              name: 'Pro Plan (Monthly)',
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
            'gpt_5_fast',
            'gpt_5_thinking',
            'gpt_5_thinking_plus_limit',
            'o3_access',
            'o4_mini_access',
            'o4_mini_high_access',
            'context_128k',
            'context_196k',
            'web_search',
            'file_uploads',
            'voice_mode',
            'code_editing',
            'custom_gpts',
            'projects',
            'agent_mode',
            'agent_limit_pro',
          ],
        },
        {
          product: {
            name: 'Business',
            default: false,
            description:
              '$30/user/mo with GPT-5 Thinking (3K/wk), o3 (100/wk), o4-mini (300/day), workspace & admin',
            slug: 'business_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'business_monthly',
              isDefault: true,
              name: 'Business Plan (per user/month)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 3000,
            },
          ],
          features: [
            'gpt_5_fast',
            'gpt_5_thinking',
            'gpt_5_thinking_plus_limit',
            'o3_access',
            'o3_limit',
            'o4_mini_access',
            'o4_mini_limit',
            'o4_mini_high_access',
            'o4_mini_high_limit',
            'context_32k',
            'context_196k',
            'web_search',
            'file_uploads',
            'voice_mode',
            'code_editing',
            'custom_gpts',
            'projects',
            'agent_mode',
            'agent_limit_standard',
            'workspace_admin',
          ],
          displayGroup: 'business',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Business',
            default: false,
            description:
              '$300/user/yr with GPT-5 Thinking (3K/wk), o3 (100/wk), o4-mini (300/day)',
            slug: 'business_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'business_yearly',
              isDefault: true,
              name: 'Business Plan (per user/year)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 30000,
            },
          ],
          features: [
            'gpt_5_fast',
            'gpt_5_thinking',
            'gpt_5_thinking_plus_limit',
            'o3_access',
            'o3_limit',
            'o4_mini_access',
            'o4_mini_limit',
            'o4_mini_high_access',
            'o4_mini_high_limit',
            'context_32k',
            'context_196k',
            'web_search',
            'file_uploads',
            'voice_mode',
            'code_editing',
            'custom_gpts',
            'projects',
            'agent_mode',
            'agent_limit_standard',
            'workspace_admin',
          ],
          displayGroup: 'business',
          displayOrder: 2,
        },
      ],
    },
  }

/**
 * Credits-Based Subscription Template
 * Used by: Lovable
 * Model: Credit-based subscription with tiered pricing. Monthly allocated credits roll over, no overage billing (hard limits).
 * Note: Daily bonus credits (5/day for paid, max 150/mo; 5/day for free, max 30/mo) consumed first but cannot be modeled with current feature system.
 */
export const CREDITS_SUBSCRIPTION_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'credits_subscription',
    title: 'Credit rollover subscription',
    description:
      'Credit-based subscription model with tiered pricing. Credits consumed per AI message (variable cost). Monthly credits roll over; no overage billing.',
    icon: Recycle as any,
    features: [
      {
        icon: Repeat,
        text: '3 plans with credit rollovers',
      },
      {
        icon: Lock,
        text: 'Hard limits (no overage charges)',
      },
      {
        icon: Users,
        text: 'Shared workspace credits',
      },
    ],
    usedBy: {
      name: 'Lovable',
      logo: {
        svg: '<svg width="78" height="23" viewBox="0 0 78 23" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.13105 4.5C10.4126 4.5 12.2621 6.35441 12.2621 8.64194V10.2161H13.6369C15.9185 10.2161 17.7679 12.0705 17.7679 14.358C17.7679 16.6456 15.9185 18.5 13.6369 18.5H4V8.64194C4 6.35441 5.84954 4.5 8.13105 4.5Z" fill="black"/><g clip-path="url(#clip0_15384_564)"><path d="M69.4597 17.2563C68.6204 17.2563 67.8911 17.0963 67.2721 16.7763C66.6531 16.451 66.1705 15.9631 65.8242 15.3126C65.4833 14.6622 65.3127 13.8568 65.3127 12.8969C65.3127 11.984 65.4911 11.1971 65.8479 10.5361C66.2046 9.86989 66.6977 9.36366 67.3272 9.01742C67.9568 8.67118 68.6728 8.49806 69.4755 8.49806C70.2467 8.49806 70.9312 8.66593 71.5293 9.00168C72.1273 9.33742 72.5916 9.82531 72.9221 10.4653C73.2578 11.1053 73.4257 11.8713 73.4257 12.7631C73.4257 13.0831 73.4231 13.3375 73.4179 13.5263H67.1462V11.8739H71.8991L71.0021 12.1808C71.0021 11.7506 70.9391 11.3912 70.8132 11.1027C70.6925 10.8089 70.5142 10.5886 70.2781 10.4417C70.042 10.2948 69.7561 10.2214 69.4204 10.2214C69.0689 10.2214 68.7594 10.3079 68.4918 10.4811C68.2295 10.6489 68.0249 10.9007 67.8781 11.2365C67.7364 11.5722 67.6656 11.9762 67.6656 12.4483V13.2588C67.6656 13.7415 67.739 14.1507 67.8859 14.4864C68.0328 14.8221 68.2427 15.0766 68.5155 15.2497C68.7882 15.4176 69.1108 15.5015 69.4833 15.5015C69.8925 15.5015 70.2309 15.3965 70.4984 15.1868C70.766 14.9716 70.9338 14.67 71.0021 14.2818H73.3864C73.3129 14.8903 73.1057 15.4176 72.7647 15.8634C72.4289 16.3094 71.9805 16.653 71.4191 16.8943C70.8578 17.1356 70.2047 17.2563 69.4597 17.2563Z" fill="black"/><path d="M62.2153 5.74373H64.5996V17.0279H62.2153V5.74373Z" fill="black"/><path d="M58.1579 17.2561C57.7068 17.2561 57.3028 17.1774 56.9461 17.0201C56.5946 16.8626 56.2956 16.6266 56.049 16.3118C55.8025 15.9919 55.6189 15.5983 55.4982 15.1314L55.75 15.2023V17.0279H53.3893V8.72609H55.7736V10.5832L55.5061 10.6304C55.6267 10.1845 55.8103 9.80415 56.0569 9.48938C56.3087 9.16938 56.6156 8.92544 56.9776 8.75757C57.3396 8.58445 57.7462 8.49788 58.1973 8.49788C58.8741 8.49788 59.4615 8.67363 59.96 9.02511C60.4584 9.37659 60.8413 9.88284 61.1089 10.5438C61.3763 11.1996 61.5101 11.9786 61.5101 12.8809C61.5101 13.778 61.3737 14.557 61.101 15.218C60.8282 15.8738 60.4373 16.3774 59.9284 16.7289C59.4249 17.0804 58.8347 17.2561 58.1579 17.2561ZM57.4183 15.4384C57.775 15.4384 58.074 15.3335 58.3153 15.1236C58.5619 14.9138 58.7455 14.6173 58.8662 14.2344C58.992 13.8515 59.0551 13.4003 59.0551 12.8809C59.0551 12.3616 58.992 11.9104 58.8662 11.5275C58.7455 11.1445 58.5619 10.8481 58.3153 10.6383C58.074 10.4232 57.775 10.3156 57.4183 10.3156C57.0668 10.3156 56.7652 10.4232 56.5133 10.6383C56.2668 10.8481 56.0805 11.1471 55.9546 11.5353C55.8288 11.9183 55.7657 12.3668 55.7657 12.8809C55.7657 13.4003 55.7657 13.8515 55.9546 14.2344C56.0805 14.6173 56.2668 14.9138 56.5133 15.1236C56.7652 15.3335 57.0668 15.4384 57.4183 15.4384ZM53.3893 5.74373H55.7736V8.72609H53.3893V5.74373Z" fill="black"/><path d="M47.4046 17.2563C46.8852 17.2563 46.4183 17.154 46.0039 16.9494C45.5947 16.7448 45.272 16.4537 45.036 16.076C44.8051 15.693 44.6898 15.2471 44.6898 14.7382C44.6898 13.9618 44.918 13.369 45.3744 12.9598C45.8307 12.5454 46.4891 12.2752 47.3495 12.1493L48.7896 11.9447C49.0781 11.9027 49.3063 11.8503 49.4741 11.7873C49.642 11.7244 49.7653 11.6404 49.8439 11.5355C49.9227 11.4253 49.962 11.2863 49.962 11.1184C49.962 10.9453 49.9148 10.7879 49.8204 10.6463C49.7312 10.4994 49.5948 10.384 49.4112 10.3001C49.2328 10.2109 49.0151 10.1663 48.758 10.1663C48.3488 10.1663 48.021 10.2738 47.7744 10.4889C47.5279 10.6988 47.3941 10.9873 47.3731 11.3545H44.9101C44.9311 10.7984 45.099 10.3053 45.4137 9.87514C45.7337 9.43972 46.177 9.10136 46.7436 8.86004C47.3101 8.61872 47.9659 8.49806 48.7108 8.49806C49.4925 8.49806 50.1535 8.62659 50.6938 8.88364C51.2342 9.13545 51.6408 9.49743 51.9135 9.96957C52.1916 10.4417 52.3306 11.0057 52.3306 11.6614V15.1238C52.3306 15.4962 52.3568 15.8425 52.4093 16.1625C52.467 16.4772 52.5483 16.6766 52.6532 16.7605V17.0281H50.1744C50.1168 16.8025 50.0722 16.5481 50.0407 16.2648C50.0092 15.9815 49.9908 15.6825 49.9856 15.3678L50.3712 15.2025C50.2715 15.5749 50.0879 15.9186 49.8204 16.2333C49.558 16.5428 49.2197 16.792 48.8053 16.9809C48.396 17.1645 47.9291 17.2563 47.4046 17.2563ZM48.2859 15.5094C48.6216 15.5094 48.918 15.4359 49.1751 15.289C49.4322 15.1369 49.6289 14.927 49.7653 14.6595C49.907 14.392 49.9777 14.0877 49.9777 13.7467V12.6608L50.1744 12.7709C50.0486 12.9388 49.8912 13.0673 49.7023 13.1565C49.5187 13.2457 49.2695 13.3218 48.9547 13.3847L48.3488 13.5028C47.9449 13.5814 47.6406 13.7021 47.4361 13.8647C47.2367 14.0274 47.137 14.2556 47.137 14.5493C47.137 14.8431 47.2446 15.0766 47.4596 15.2497C47.6748 15.4228 47.9502 15.5094 48.2859 15.5094Z" fill="black"/><path d="M36.5802 8.72622H39.114L41.2937 15.8477H40.5304L42.6235 8.72622H45.0866L42.2143 17.028H39.5625L36.5802 8.72622Z" fill="black"/><path d="M32.853 17.2563C32.0293 17.2563 31.3054 17.0779 30.6811 16.7212C30.062 16.3645 29.5821 15.8556 29.241 15.1946C28.9053 14.5336 28.7375 13.7598 28.7375 12.8732C28.7375 11.9867 28.9053 11.2155 29.241 10.5597C29.5821 9.89875 30.062 9.38988 30.6811 9.03315C31.3054 8.67643 32.0293 8.49806 32.853 8.49806C33.6765 8.49806 34.3979 8.67643 35.0169 9.03315C35.6359 9.38988 36.1133 9.89875 36.4491 10.5597C36.7901 11.2155 36.9606 11.9867 36.9606 12.8732C36.9606 13.7598 36.7901 14.5336 36.4491 15.1946C36.1133 15.8556 35.6359 16.3645 35.0169 16.7212C34.3979 17.0779 33.6765 17.2563 32.853 17.2563ZM32.853 15.4307C33.1992 15.4307 33.4956 15.3362 33.7422 15.1474C33.9887 14.9533 34.1775 14.6674 34.3087 14.2897C34.4399 13.9067 34.5054 13.4345 34.5054 12.8732C34.5054 12.0391 34.3612 11.407 34.0726 10.9768C33.7841 10.5414 33.3775 10.3237 32.853 10.3237C32.5067 10.3237 32.2077 10.4207 31.9559 10.6148C31.7093 10.8037 31.5204 11.0896 31.3893 11.4726C31.2582 11.8503 31.1925 12.3172 31.1925 12.8732C31.1925 13.4293 31.2582 13.8988 31.3893 14.2818C31.5204 14.6648 31.7093 14.9533 31.9559 15.1474C32.2077 15.3362 32.5067 15.4307 32.853 15.4307Z" fill="black"/><path d="M21.7678 5.74365H24.2387V15.2695L23.798 14.758C23.798 14.758 25.0218 14.758 27.127 14.758C29.2322 14.758 28.9444 17.0278 28.9444 17.0278H21.7678V5.74365Z" fill="black"/></g><defs><clipPath id="clip0_15384_564"><rect width="51.6579" height="11.5127" fill="white" transform="translate(21.7678 5.74365)"/></clipPath></defs></svg>',
      },
    },
  },
  input: {
    name: 'Credit rollover subscription',
    isDefault: false,

    // Usage Meters
    usageMeters: [
      {
        slug: 'ai_credits',
        name: 'AI Credits',
      },
    ],

    // Features
    features: [
      // Monthly Credit Grants - Pro/Business tiers
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'monthly_credits_100',
        name: '100 Monthly AI Credits',
        description:
          '100 AI credits allocated each billing period (rolls over while subscription is active)',
        usageMeterSlug: 'ai_credits',
        amount: 100,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'monthly_credits_200',
        name: '200 Monthly AI Credits',
        description:
          '200 AI credits allocated each billing period (rolls over while subscription is active)',
        usageMeterSlug: 'ai_credits',
        amount: 200,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'monthly_credits_400',
        name: '400 Monthly AI Credits',
        description:
          '400 AI credits allocated each billing period (rolls over while subscription is active)',
        usageMeterSlug: 'ai_credits',
        amount: 400,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },

      // Pro Tier Toggle Features
      {
        type: FeatureType.Toggle,
        slug: 'workspace_collaboration',
        name: 'Workspace Collaboration',
        description: 'Unlimited team members in workspace',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'custom_domains',
        name: 'Custom Domains',
        description: 'Connect custom domains to your projects',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'remove_lovable_badge',
        name: 'Remove Lovable Badge',
        description: 'Remove "Edit with Lovable" badge from projects',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'private_projects',
        name: 'Private Projects',
        description: 'Create private projects',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'user_roles_permissions',
        name: 'User Roles & Permissions',
        description: 'Manage workspace roles and permissions',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'code_mode',
        name: 'Code Mode',
        description: 'Edit code directly inside Lovable',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'credit_rollovers',
        name: 'Credit Rollovers',
        description:
          'Unused monthly credits roll over to next month while subscription active',
        active: true,
      },

      // Business Tier Additional Features
      {
        type: FeatureType.Toggle,
        slug: 'sso',
        name: 'Single Sign-On (SSO)',
        description: 'Enterprise SSO authentication',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'personal_projects',
        name: 'Personal Projects',
        description: 'Personal projects within workspaces',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'opt_out_training',
        name: 'Opt Out of Data Training',
        description: 'Exclude your data from AI training',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'design_templates',
        name: 'Design Templates',
        description: 'Build reusable design templates',
        active: true,
      },
    ],

    // Products
    products: [
      // Free Tier
      {
        product: {
          name: 'Free',
          default: true,
          description:
            'Free tier with 5 daily credits (max 30/month). Perfect for getting started.',
          slug: 'free_tier',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free_tier_plan',
            isDefault: true,
            name: 'Free Tier Plan',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 0,
          },
        ],
        features: ['workspace_collaboration'],
      },

      // Pro 100
      {
        product: {
          name: 'Pro 100',
          default: false,
          description:
            'Pro plan with 100 monthly credits + 5 daily bonus credits (max 150/month). Includes custom domains, private projects, and code mode.',
          slug: 'pro_100_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_100_monthly',
            isDefault: true,
            name: 'Pro 100 (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 2500,
          },
        ],
        features: [
          'monthly_credits_100',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
        ],
        displayGroup: 'pro_100',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Pro 100',
          default: false,
          description:
            'Pro plan with 100 annual credits + 5 daily bonus credits (max 150/month). Includes custom domains, private projects, and code mode.',
          slug: 'pro_100_annual',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_100_annual',
            isDefault: true,
            name: 'Pro 100 (Annual)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 25000,
          },
        ],
        features: [
          'monthly_credits_100',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
        ],
        displayGroup: 'pro_100',
        displayOrder: 2,
      },

      // Pro 200
      {
        product: {
          name: 'Pro 200',
          default: false,
          description:
            'Pro plan with 200 monthly credits + 5 daily bonus credits (max 150/month).',
          slug: 'pro_200_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_200_monthly',
            isDefault: true,
            name: 'Pro 200 (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 5000,
          },
        ],
        features: [
          'monthly_credits_200',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
        ],
        displayGroup: 'pro_200',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Pro 200',
          default: false,
          description:
            'Pro plan with 200 annual credits + 5 daily bonus credits (max 150/month).',
          slug: 'pro_200_annual',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_200_annual',
            isDefault: true,
            name: 'Pro 200 (Annual)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 50000,
          },
        ],
        features: [
          'monthly_credits_200',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
        ],
        displayGroup: 'pro_200',
        displayOrder: 2,
      },

      // Pro 400
      {
        product: {
          name: 'Pro 400',
          default: false,
          description:
            'Pro plan with 400 monthly credits + 5 daily bonus credits (max 150/month).',
          slug: 'pro_400_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_400_monthly',
            isDefault: true,
            name: 'Pro 400 (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 10000,
          },
        ],
        features: [
          'monthly_credits_400',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
        ],
        displayGroup: 'pro_400',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Pro 400',
          default: false,
          description:
            'Pro plan with 400 annual credits + 5 daily bonus credits (max 150/month).',
          slug: 'pro_400_annual',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_400_annual',
            isDefault: true,
            name: 'Pro 400 (Annual)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 100000,
          },
        ],
        features: [
          'monthly_credits_400',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
        ],
        displayGroup: 'pro_400',
        displayOrder: 2,
      },

      // Business 100
      {
        product: {
          name: 'Business 100',
          default: false,
          description:
            'Business plan with 100 monthly credits + 5 daily bonus credits (max 150/month). Includes all Pro features plus SSO, personal projects, and design templates.',
          slug: 'business_100_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_100_monthly',
            isDefault: true,
            name: 'Business 100 (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 5000,
          },
        ],
        features: [
          'monthly_credits_100',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
          'sso',
          'personal_projects',
          'opt_out_training',
          'design_templates',
        ],
        displayGroup: 'business_100',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Business 100',
          default: false,
          description:
            'Business plan with 100 annual credits + 5 daily bonus credits (max 150/month). Includes all Pro features plus SSO, personal projects, and design templates.',
          slug: 'business_100_annual',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_100_annual',
            isDefault: true,
            name: 'Business 100 (Annual)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 50000,
          },
        ],
        features: [
          'monthly_credits_100',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
          'sso',
          'personal_projects',
          'opt_out_training',
          'design_templates',
        ],
        displayGroup: 'business_100',
        displayOrder: 2,
      },

      // Business 200
      {
        product: {
          name: 'Business 200',
          default: false,
          description:
            'Business plan with 200 monthly credits + 5 daily bonus credits (max 150/month).',
          slug: 'business_200_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_200_monthly',
            isDefault: true,
            name: 'Business 200 (Monthly)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 10000,
          },
        ],
        features: [
          'monthly_credits_200',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
          'sso',
          'personal_projects',
          'opt_out_training',
          'design_templates',
        ],
        displayGroup: 'business_200',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Business 200',
          default: false,
          description:
            'Business plan with 200 annual credits + 5 daily bonus credits (max 150/month).',
          slug: 'business_200_annual',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_200_annual',
            isDefault: true,
            name: 'Business 200 (Annual)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 100000,
          },
        ],
        features: [
          'monthly_credits_200',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
          'sso',
          'personal_projects',
          'opt_out_training',
          'design_templates',
        ],
        displayGroup: 'business_200',
        displayOrder: 2,
      },

      // Business 400
      {
        product: {
          name: 'Business 400',
          default: false,
          description:
            'Business plan with 400 monthly credits + 5 daily bonus credits (max 150/month).',
          slug: 'business_400_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_400_monthly',
            isDefault: true,
            name: 'Business 400 (Monthly)',
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
          'monthly_credits_400',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
          'sso',
          'personal_projects',
          'opt_out_training',
          'design_templates',
        ],
        displayGroup: 'business_400',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Business 400',
          default: false,
          description:
            'Business plan with 400 annual credits + 5 daily bonus credits (max 150/month).',
          slug: 'business_400_annual',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_400_annual',
            isDefault: true,
            name: 'Business 400 (Annual)',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 200000,
          },
        ],
        features: [
          'monthly_credits_400',
          'workspace_collaboration',
          'custom_domains',
          'remove_lovable_badge',
          'private_projects',
          'user_roles_permissions',
          'code_mode',
          'credit_rollovers',
          'sso',
          'personal_projects',
          'opt_out_training',
          'design_templates',
        ],
        displayGroup: 'business_400',
        displayOrder: 2,
      },
    ],
  },
}

/**
 * AI Image Generation Subscription Template
 * Used by: Midjourney
 * Model: Tiered subscriptions with Fast GPU time credits + unlimited Relax mode. Overages billed at $4/hr.
 */
export const AI_IMAGE_GENERATION_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'ai_image_generation_subscription',
      title: 'Generation-based subscription',
      description:
        'Tiered subscription plans with Fast GPU time credits and unlimited Relax mode. Perfect for AI image/video generation platforms.',
      icon: Image,
      features: [
        {
          icon: Clock,
          text: '4 plans with tiered GPU time',
        },
        {
          icon: Zap,
          text: 'Fast & Relax rendering modes',
        },
        {
          icon: SquarePlus,
          text: 'Additional GPU time at $4/hr',
        },
      ],
      usedBy: {
        name: 'Midjourney',
        logo: {
          svg: '<svg width="19" height="17" viewBox="0 0 19 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.31709 12.0001C3.24174 12.0943 3.2229 12.2289 3.31709 12.3042C3.35477 12.3608 3.43012 12.3796 3.50816 12.3796C3.54584 12.3796 3.60236 12.3608 3.64003 12.3419C5.53999 11.0878 7.56913 10.9936 8.93624 11.1659C10.4352 11.3354 11.4794 11.8118 11.4982 11.8306C11.5736 11.8683 11.6678 11.8494 11.727 11.8118C11.8023 11.7552 11.84 11.6799 11.8212 11.583C11.6516 10.1029 11.1188 8.63888 10.2253 7.25293C9.52292 6.15224 8.57294 5.08923 7.45341 4.10158C5.49694 2.43036 3.69386 1.55843 3.6185 1.52075C3.527 1.48038 3.41397 1.49922 3.35477 1.57457C3.27942 1.64993 3.27942 1.76565 3.31709 1.841C4.15135 3.28346 4.66536 4.72593 4.85375 6.11188C5.00445 7.21256 4.94794 8.27557 4.6842 9.3009C4.2294 11.0125 3.33593 11.9813 3.31709 12.0001ZM5.31125 6.0742C5.1417 4.85779 4.74072 3.58756 4.09484 2.31464C4.79723 2.71294 5.93559 3.43417 7.11432 4.4595C8.21501 5.40948 9.12732 6.45365 9.81087 7.51666C10.5886 8.71423 11.0838 9.96562 11.291 11.2574C10.8362 11.0878 10.0181 10.8402 8.99276 10.7245C7.75751 10.5927 6.02979 10.6303 4.30206 11.4458C4.58732 10.9721 4.91026 10.3074 5.13632 9.45161C5.40544 8.37245 5.48348 7.23409 5.31125 6.0742ZM7.97011 3.74096C8.16119 3.85399 11.256 5.90466 12.6608 11.2977C12.6985 11.4108 12.8115 11.4888 12.9272 11.4673C12.9461 11.4673 14.1033 11.2762 14.7868 11.7337C14.8245 11.7526 14.8622 11.7714 14.9187 11.7714C14.9752 11.7714 15.0129 11.7526 15.0506 11.7337C15.1259 11.6772 15.1636 11.583 15.1448 11.4861C15.1259 11.4296 14.7465 10.006 13.7023 8.27826C12.7335 6.6824 10.9869 4.53754 8.21501 3.3023C8.13966 3.26462 8.06431 3.26462 7.98626 3.3023C7.91091 3.33998 7.87323 3.41533 7.87323 3.51221C7.85709 3.6064 7.89476 3.70059 7.97011 3.74096ZM13.2663 8.52585C13.9122 9.58886 14.3105 10.5577 14.5204 11.1094C14.1598 10.9963 13.7803 10.9587 13.4762 10.9587C13.3067 10.9587 13.1721 10.9587 13.0591 10.9775C12.2814 8.09257 11.0273 6.19261 10.115 5.09192C10.0396 4.99773 9.94543 4.88201 9.86739 4.80666C11.4821 5.94233 12.5828 7.3848 13.2663 8.52585ZM17.5399 15.0385C17.408 15.0385 17.2923 15.0008 17.1793 14.9066L16.1539 14.1665C15.7557 13.8813 15.2416 13.8813 14.8622 14.1665L13.8369 14.9066C13.6081 15.0761 13.3228 15.0761 13.0968 14.9066L13.0214 14.8501C15.4327 13.7117 16.6114 12.5518 16.668 12.4953C16.7433 12.42 16.7621 12.3258 16.7056 12.2289C16.668 12.1347 16.5738 12.0782 16.4769 12.097L2.33213 12.9905C2.25677 12.9905 2.18142 13.047 2.14105 13.1035C2.10338 13.1789 2.10338 13.2542 2.14105 13.3323L2.6147 14.1665L1.58937 14.9066C1.47634 14.982 1.36062 15.0196 1.22875 15.0385C1.09688 15.0385 1 15.1515 1 15.2672C1 15.3991 1.11303 15.496 1.22875 15.496C1.4575 15.496 1.66472 15.4206 1.85579 15.2861L2.86229 14.546C3.09104 14.3764 3.37361 14.3764 3.60236 14.546L4.62769 15.2861C4.81876 15.4368 5.04482 15.496 5.27357 15.496C5.50232 15.496 5.72838 15.4206 5.91945 15.2861L6.94478 14.546C7.17353 14.3764 7.4561 14.3764 7.68485 14.546L8.71018 15.2861C9.10848 15.5713 9.62249 15.5713 10.0019 15.2861L11.0273 14.546C11.256 14.3764 11.5386 14.3764 11.7673 14.546L12.7927 15.2861C13.191 15.5713 13.705 15.5713 14.0844 15.2861L15.1098 14.546C15.3385 14.3764 15.6211 14.3764 15.8498 14.546L16.8752 15.2861C17.0662 15.4179 17.2735 15.496 17.5022 15.496C17.6341 15.496 17.731 15.4018 17.731 15.2672C17.7686 15.1515 17.6529 15.0385 17.5399 15.0385ZM10.7797 14.1827L9.7732 14.9227C9.54445 15.0923 9.25918 15.0923 9.03313 14.9227L8.00779 14.1827C7.6095 13.8974 7.09549 13.8974 6.71603 14.1827L5.6907 14.9227C5.46195 15.0923 5.17669 15.0923 4.95063 14.9227L3.9253 14.1827C3.65887 13.9916 3.35477 13.9351 3.06951 13.9916L2.74657 13.4399L15.8095 12.6245C15.6776 12.7187 15.543 12.8344 15.3735 12.9474C14.803 13.3646 13.8745 13.9539 12.5828 14.5433L12.0688 14.1638C11.692 13.8974 11.178 13.8974 10.7797 14.1827Z" fill="black"/></svg>',
          text: 'Midjourney',
        },
      },
    },
    input: {
      name: 'AI Image Generation Subscription',
      isDefault: false,

      // Usage Meters
      usageMeters: [
        {
          slug: 'fast_generations',
          name: 'Fast Generations',
        },
        {
          slug: 'hd_video_minutes',
          name: 'HD Video Minutes',
        },
      ],

      // Features
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'basic_fast_generations',
          name: '200 Fast Generations',
          description: 'Limited generations (~200 images per month)',
          usageMeterSlug: 'fast_generations',
          amount: 200,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'standard_fast_generations',
          name: '360 Fast Generations',
          description: '360 fast generations per month',
          usageMeterSlug: 'fast_generations',
          amount: 360,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro_fast_generations',
          name: '750 Fast Generations',
          description: '750 fast generations per month',
          usageMeterSlug: 'fast_generations',
          amount: 750,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'mega_fast_generations',
          name: '900+ Fast Generations',
          description: '900+ fast generations per month',
          usageMeterSlug: 'fast_generations',
          amount: 900,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'standard_hd_video_minutes',
          name: '30 HD Video Minutes',
          description: '30 minutes of HD video generation per month',
          usageMeterSlug: 'hd_video_minutes',
          amount: 30,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'pro_hd_video_minutes',
          name: '60 HD Video Minutes',
          description: '60 minutes of HD video generation per month',
          usageMeterSlug: 'hd_video_minutes',
          amount: 60,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'mega_hd_video_minutes',
          name: '120 HD Video Minutes',
          description: '120 minutes of HD video generation per month',
          usageMeterSlug: 'hd_video_minutes',
          amount: 120,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: '3d_video_generation',
          name: '3D Video Generation',
          description: 'Generate 3D videos',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'general_commercial_terms',
          name: 'General Commercial Terms',
          description: 'Commercial usage rights',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'optional_credit_top_ups',
          name: 'Optional Credit Top Ups',
          description: 'Purchase additional credits as needed',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'relax_mode_included',
          name: 'Relax Mode Included',
          description: 'Access to Relax mode generation',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_relaxed_images',
          name: 'Unlimited Relaxed Image Generations',
          description: 'Unlimited image generation in Relax mode',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_relaxed_sd_video',
          name: 'Unlimited Relaxed Image and SD Video',
          description: 'Unlimited Relax mode images and SD video',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'stealth_mode',
          name: 'Stealth Mode',
          description: 'Keep your images and videos private',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'use_within_upgraded_images',
          name: 'Use Within Upgraded Images',
          description: 'Use within upgraded images',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Basic',
            default: false,
            description: '$10/mo + ~200 fast generations + 3D video',
            slug: 'basic_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'basic_monthly',
              isDefault: true,
              name: 'Basic Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 1000,
            },
          ],
          features: [
            'basic_fast_generations',
            '3d_video_generation',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'use_within_upgraded_images',
          ],
          displayGroup: 'basic',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Basic',
            default: false,
            description: '$96/yr + ~200 fast generations + 3D video',
            slug: 'basic_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'basic_yearly',
              isDefault: true,
              name: 'Basic Plan (Yearly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 9600,
            },
          ],
          features: [
            'basic_fast_generations',
            '3d_video_generation',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'use_within_upgraded_images',
          ],
          displayGroup: 'basic',
          displayOrder: 2,
        },
        {
          product: {
            name: 'Standard',
            default: false,
            description:
              '$30/mo + 360 fast generations + 30 min HD video',
            slug: 'standard_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'standard_monthly',
              isDefault: true,
              name: 'Standard Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 3000,
            },
          ],
          features: [
            'standard_fast_generations',
            'standard_hd_video_minutes',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'unlimited_relaxed_images',
            'use_within_upgraded_images',
          ],
          displayGroup: 'standard',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Standard',
            default: false,
            description:
              '$288/yr + 360 fast generations + 30 min HD video',
            slug: 'standard_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'standard_yearly',
              isDefault: true,
              name: 'Standard Plan (Yearly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 28800,
            },
          ],
          features: [
            'standard_fast_generations',
            'standard_hd_video_minutes',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'unlimited_relaxed_images',
            'use_within_upgraded_images',
          ],
          displayGroup: 'standard',
          displayOrder: 2,
        },
        {
          product: {
            name: 'Pro',
            default: false,
            description:
              '$60/mo + 750 fast generations + 60 min HD video + Stealth',
            slug: 'pro_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro_monthly',
              isDefault: true,
              name: 'Pro Plan (Monthly)',
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
            'pro_fast_generations',
            'pro_hd_video_minutes',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'unlimited_relaxed_sd_video',
            'stealth_mode',
            'use_within_upgraded_images',
          ],
          displayGroup: 'pro',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Pro',
            default: false,
            description:
              '$576/yr + 750 fast generations + 60 min HD video + Stealth',
            slug: 'pro_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'pro_yearly',
              isDefault: true,
              name: 'Pro Plan (Yearly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 57600,
            },
          ],
          features: [
            'pro_fast_generations',
            'pro_hd_video_minutes',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'unlimited_relaxed_sd_video',
            'stealth_mode',
            'use_within_upgraded_images',
          ],
          displayGroup: 'pro',
          displayOrder: 2,
        },
        {
          product: {
            name: 'Mega',
            default: false,
            description:
              '$120/mo + 900+ fast generations + 120 min HD video + Stealth',
            slug: 'mega_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'mega_monthly',
              isDefault: true,
              name: 'Mega Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 12000,
            },
          ],
          features: [
            'mega_fast_generations',
            'mega_hd_video_minutes',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'unlimited_relaxed_sd_video',
            'stealth_mode',
            'use_within_upgraded_images',
          ],
          displayGroup: 'mega',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Mega',
            default: false,
            description:
              '$1,152/yr + 900+ fast generations + 120 min HD video + Stealth',
            slug: 'mega_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'mega_yearly',
              isDefault: true,
              name: 'Mega Plan (Yearly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 115200,
            },
          ],
          features: [
            'mega_fast_generations',
            'mega_hd_video_minutes',
            'general_commercial_terms',
            'optional_credit_top_ups',
            'relax_mode_included',
            'unlimited_relaxed_sd_video',
            'stealth_mode',
            'use_within_upgraded_images',
          ],
          displayGroup: 'mega',
          displayOrder: 2,
        },
      ],
    },
  }

/**
 * Seat-Based Subscription Template
 * Used by: Linear
 * Model: Per-user pricing with tiered features. Simple subscription model with no usage billing.
 */
export const SEAT_BASED_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'seat_based_subscription',
      title: 'Seat-based subscription',
      description:
        'Per-user pricing with tiered features. Simple subscription model perfect for team collaboration tools. Features scale with plan tier.',
      icon: Users,
      features: [
        {
          icon: UserPlus,
          text: 'Per-user pricing model',
        },
        {
          icon: Layers,
          text: 'Tiered feature access',
        },
        {
          icon: Shield,
          text: 'Admin roles & security controls',
        },
      ],
      usedBy: {
        name: 'Linear',
        logo: {
          svg: '<svg width="76" height="23" viewBox="0 0 76 23" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_15390_574)"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.3268 5.44683C4.2317 5.55134 4.238 5.71169 4.3379 5.8116L16.6849 18.1586C16.7849 18.2585 16.9452 18.2648 17.0497 18.1697C18.8601 16.5223 19.9965 14.1471 19.9965 11.5065C19.9965 6.53236 15.9642 2.5 10.99 2.5C8.3494 2.5 5.97419 3.63641 4.3268 5.44683ZM2.78361 7.79009C2.73798 7.89069 2.76099 8.00865 2.83909 8.08675L14.4098 19.6574C14.4879 19.7355 14.6058 19.7585 14.7064 19.7129C14.9737 19.5917 15.2341 19.4578 15.4866 19.3119C15.6368 19.2253 15.6598 19.0204 15.5372 18.8979L3.59867 6.95936C3.4761 6.83678 3.27126 6.85978 3.18459 7.0099C3.03877 7.26248 2.90485 7.52279 2.78361 7.79009ZM2.08165 11.1033C2.02748 11.0491 1.99865 10.9744 2.00375 10.898C2.02764 10.54 2.07245 10.1877 2.13697 9.84229C2.17565 9.6352 2.4287 9.56334 2.57766 9.71229L12.7842 19.9189C12.9332 20.0678 12.8613 20.3209 12.6542 20.3596C12.3089 20.4241 11.9566 20.4689 11.5985 20.4928C11.5221 20.4979 11.4474 20.4691 11.3933 20.4149L2.08165 11.1033ZM2.70801 13.6166C2.52205 13.4306 2.22196 13.5909 2.29006 13.8449C3.1198 16.9397 5.55688 19.3767 8.65164 20.2065C8.90566 20.2746 9.06589 19.9745 8.87993 19.7885L2.70801 13.6166ZM38.2884 7.4563C38.934 7.4563 39.4573 6.93106 39.4573 6.28315C39.4573 5.63524 38.934 5.11 38.2884 5.11C37.6429 5.11 37.1196 5.63524 37.1196 6.28315C37.1196 6.93106 37.6429 7.4563 38.2884 7.4563ZM28.2766 17.6874V5.1107H30.3538V15.8473H35.9545V17.6874H28.2766ZM43.0611 12.5554V17.6874H41.0512V8.77399H43.0359V10.3018L43.0611 10.2849C43.2629 9.80658 43.5881 9.40705 44.0367 9.08629C44.4851 8.75991 45.0569 8.59673 45.7523 8.59673C46.3689 8.59673 46.9295 8.73461 47.4342 9.01033C47.9387 9.28044 48.3423 9.67714 48.645 10.2005C48.9478 10.7238 49.0992 11.3653 49.0992 12.125V17.6874H47.0893V12.4035C47.0893 11.7283 46.9098 11.2162 46.5511 10.8673C46.1979 10.5128 45.7242 10.3355 45.1298 10.3355C44.7486 10.3355 44.401 10.4143 44.0871 10.5719C43.7732 10.7294 43.5237 10.9714 43.3386 11.2978C43.1536 11.6241 43.0611 12.0434 43.0611 12.5554ZM61.26 17.5355C61.7197 17.7324 62.2467 17.8309 62.8409 17.8309C63.3287 17.8309 63.7463 17.769 64.0939 17.6452C64.4417 17.5158 64.7275 17.3442 64.9518 17.1303C65.1816 16.9165 65.3638 16.683 65.4984 16.4298H65.5321V17.6874H67.4579V11.551C67.4579 11.1177 67.3737 10.721 67.2056 10.3609C67.0374 10.0007 66.7935 9.68841 66.4739 9.42393C66.1599 9.15944 65.7787 8.95687 65.3301 8.8162C64.8818 8.66988 64.377 8.59673 63.8165 8.59673C63.0484 8.59673 62.3841 8.72897 61.8234 8.99345C61.2683 9.2523 60.8339 9.60118 60.5198 10.0401C60.2059 10.479 60.0349 10.9742 60.0068 11.5257H61.9496C61.9719 11.2668 62.0617 11.0361 62.2187 10.8335C62.3756 10.631 62.5887 10.4734 62.8578 10.3609C63.1269 10.2427 63.438 10.1836 63.7913 10.1836C64.1445 10.1836 64.4444 10.2427 64.6911 10.3609C64.9433 10.479 65.1368 10.6394 65.2713 10.842C65.4059 11.0445 65.4732 11.2809 65.4732 11.551V11.6185C65.4732 11.8211 65.403 11.9702 65.263 12.0659C65.1284 12.1615 64.8985 12.2319 64.5734 12.2769C64.2537 12.3219 63.8165 12.3754 63.2614 12.4373C62.8073 12.4879 62.37 12.5639 61.9496 12.6652C61.5291 12.7665 61.1534 12.9156 60.8226 13.1125C60.4975 13.3095 60.2395 13.5712 60.0489 13.8975C59.8583 14.2239 59.7631 14.6431 59.7631 15.1552C59.7631 15.7461 59.8976 16.2412 60.1667 16.6408C60.4358 17.0347 60.8002 17.3329 61.26 17.5355ZM64.5146 16.0415C64.1893 16.2159 63.7884 16.3031 63.312 16.3031C62.8298 16.3031 62.4456 16.2019 62.1598 15.9993C61.8738 15.7911 61.7309 15.5069 61.7309 15.1468C61.7309 14.8654 61.8093 14.6375 61.9663 14.4631C62.129 14.2886 62.342 14.1508 62.6055 14.0495C62.869 13.9482 63.1548 13.8778 63.4632 13.8384C63.6875 13.8047 63.9062 13.7709 64.1193 13.7371C64.3322 13.6978 64.5313 13.6612 64.7163 13.6274C64.9014 13.588 65.0583 13.5486 65.1872 13.5093C65.3219 13.4699 65.42 13.4277 65.4815 13.3826V14.3787C65.4815 14.7275 65.4003 15.0483 65.2376 15.3409C65.0807 15.6279 64.8396 15.8614 64.5146 16.0415ZM69.2115 17.6874V8.77399H71.1456V10.2427H71.171C71.3335 9.73623 71.5886 9.35078 71.9361 9.08629C72.2893 8.8162 72.7519 8.68115 73.3238 8.68115C73.464 8.68115 73.5902 8.68676 73.7021 8.69803C73.82 8.70365 73.9181 8.70928 73.9966 8.7149V10.5297C73.9237 10.5184 73.7946 10.5043 73.6098 10.4875C73.4247 10.4706 73.2285 10.4621 73.021 10.4621C72.6902 10.4621 72.3876 10.5381 72.1127 10.69C71.838 10.842 71.6193 11.0755 71.4568 11.3906C71.2998 11.7001 71.2214 12.0912 71.2214 12.5639V17.6874H69.2115ZM37.2793 17.6874V8.77399H39.2892V17.6874H37.2793ZM52.4421 17.2907C53.0869 17.6902 53.8523 17.89 54.738 17.89C55.422 17.89 56.0443 17.7662 56.605 17.5186C57.1713 17.2654 57.6422 16.9193 58.0178 16.4804C58.3935 16.0359 58.6374 15.5238 58.7495 14.9442H56.8574C56.7731 15.2086 56.6358 15.4422 56.4452 15.6448C56.2603 15.8417 56.0276 15.9965 55.7473 16.109C55.4669 16.2215 55.1418 16.2778 54.7717 16.2778C54.2727 16.2778 53.8438 16.1653 53.4851 15.9402C53.1319 15.7151 52.8628 15.4028 52.6778 15.0033C52.5098 14.6355 52.418 14.2191 52.4025 13.754H58.8672V13.2138C58.8672 12.5273 58.7663 11.9027 58.5645 11.34C58.3627 10.7716 58.0767 10.2821 57.7066 9.87129C57.3367 9.45488 56.891 9.13413 56.3696 8.90904C55.8537 8.68395 55.2791 8.57142 54.6455 8.57142C53.8215 8.57142 53.0927 8.77118 52.4591 9.17071C51.8255 9.57024 51.3294 10.1217 50.9705 10.8251C50.6117 11.5285 50.4323 12.3332 50.4323 13.2391C50.4323 14.1395 50.6061 14.9414 50.9537 15.6448C51.3013 16.3425 51.7976 16.8912 52.4421 17.2907ZM56.6723 11.3906C56.4873 11.008 56.2237 10.7126 55.8817 10.5043C55.5397 10.2961 55.1362 10.192 54.6707 10.192C54.211 10.192 53.8101 10.2961 53.4681 10.5043C53.1319 10.7126 52.8684 11.008 52.6778 11.3906C52.5417 11.6677 52.4556 11.9829 52.4196 12.336H56.9303C56.8943 11.9829 56.8082 11.6677 56.6723 11.3906Z" fill="#222326"/></g><defs><clipPath id="clip0_15390_574"><rect width="72" height="18" fill="white" transform="translate(2 2.5)"/></clipPath></defs></svg>',
        },
      },
    },
    input: {
      name: 'Seat-Based Subscription',
      isDefault: false,

      // Usage Meters - None needed for seat-based billing
      usageMeters: [],

      // Features
      features: [
        // Core features
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_members',
          name: 'Unlimited Members',
          description: 'Invite unlimited members to your workspace',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'slack_github',
          name: 'Slack & GitHub Integration',
          description: 'Connect with Slack and GitHub',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'ai_agents',
          name: 'AI Agents',
          description: 'Linear for Agents and MCP access',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'api_webhooks',
          name: 'API & Webhook Access',
          description: 'Full API and webhook integration',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'import_export',
          name: 'Import & Export',
          description: 'Import from other tools and export your data',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'triage',
          name: 'Triage',
          description: 'Organize and prioritize issues',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'customer_requests',
          name: 'Customer Requests',
          description: 'Manage customer feedback and requests',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'issue_sync',
          name: 'Issue Sync',
          description: 'Synchronize issues across teams',
          active: true,
        },

        // Basic tier features
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_issues',
          name: 'Unlimited Issues',
          description: 'Create unlimited issues',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_file_uploads',
          name: 'Unlimited File Uploads',
          description: 'Upload unlimited files',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'admin_roles',
          name: 'Admin Roles',
          description: 'Assign admin roles for team management',
          active: true,
        },

        // Business tier features
        {
          type: FeatureType.Toggle,
          slug: 'issue_slas',
          name: 'Issue SLAs',
          description: 'Set and track SLAs for issues',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_teams',
          name: 'Unlimited Teams',
          description: 'Create unlimited teams',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'private_teams',
          name: 'Private Teams & Guests',
          description: 'Create private teams and invite guests',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'product_intelligence',
          name: 'Product Intelligence',
          description: 'AI-powered product insights',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'linear_insights',
          name: 'Linear Insights',
          description: 'Advanced analytics and reporting',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'linear_asks',
          name: 'Linear Asks',
          description: 'Slack and email intake channels',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'support_integrations',
          name: 'Support Integrations',
          description: 'Zendesk and Intercom integrations',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'triage_responsibility',
          name: 'Triage Responsibility',
          description: 'Assign triage responsibilities',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'triage_routing',
          name: 'Triage Routing',
          description: 'Auto-route issues to the right teams',
          active: true,
        },

        // Enterprise tier features
        {
          type: FeatureType.Toggle,
          slug: 'sub_initiatives',
          name: 'Sub-initiatives',
          description:
            'Create sub-initiatives for better organization',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'advanced_linear_asks',
          name: 'Advanced Linear Asks',
          description:
            'Multiple Slack workspaces and per-channel configurations',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'dashboards',
          name: 'Dashboards',
          description: 'Create custom dashboards',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'saml_sso',
          name: 'SAML SSO',
          description: 'Single sign-on with SAML',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'scim_provisioning',
          name: 'SCIM Provisioning',
          description: 'Automated user provisioning with SCIM',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'advanced_security',
          name: 'Advanced Security',
          description:
            'IP restrictions, audit logs, and third-party app management',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'migration_support',
          name: 'Migration & Onboarding Support',
          description:
            'Dedicated migration and onboarding assistance',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'priority_support',
          name: 'Priority Support',
          description: 'Priority customer support',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'account_manager',
          name: 'Account Manager',
          description: 'Dedicated account manager',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Free',
            default: true,
            description:
              'Free for everyone. Unlimited members, 2 teams, 250 issues, Slack/GitHub integration, and AI agents.',
            slug: 'free_tier',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'free_plan',
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
          features: [
            'unlimited_members',
            'slack_github',
            'ai_agents',
            'api_webhooks',
            'import_export',
            'triage',
            'customer_requests',
            'issue_sync',
          ],
        },
        {
          product: {
            name: 'Basic',
            default: false,
            description:
              '$10/user/month. All Free features + 5 teams, unlimited issues, unlimited file uploads, and admin roles.',
            slug: 'basic_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'basic_monthly',
              isDefault: true,
              name: 'Basic Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 1000,
            },
          ],
          features: [
            'unlimited_members',
            'slack_github',
            'ai_agents',
            'api_webhooks',
            'import_export',
            'triage',
            'customer_requests',
            'issue_sync',
            'unlimited_issues',
            'unlimited_file_uploads',
            'admin_roles',
          ],
          displayGroup: 'basic',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Basic',
            default: false,
            description:
              '$120/user/year. All Free features + 5 teams, unlimited issues, unlimited file uploads, and admin roles.',
            slug: 'basic_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'basic_yearly',
              isDefault: true,
              name: 'Basic Plan (Yearly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 12000,
            },
          ],
          features: [
            'unlimited_members',
            'slack_github',
            'ai_agents',
            'api_webhooks',
            'import_export',
            'triage',
            'customer_requests',
            'issue_sync',
            'unlimited_issues',
            'unlimited_file_uploads',
            'admin_roles',
          ],
          displayGroup: 'basic',
          displayOrder: 2,
        },
        {
          product: {
            name: 'Business',
            default: false,
            description:
              '$16/user/month. All Basic features + unlimited teams, private teams, Product Intelligence, Linear Insights, Linear Asks, and support integrations.',
            slug: 'business_monthly',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'business_monthly',
              isDefault: true,
              name: 'Business Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 1600,
            },
          ],
          features: [
            'unlimited_members',
            'slack_github',
            'ai_agents',
            'api_webhooks',
            'import_export',
            'triage',
            'customer_requests',
            'issue_sync',
            'unlimited_issues',
            'unlimited_file_uploads',
            'admin_roles',
            'issue_slas',
            'unlimited_teams',
            'private_teams',
            'product_intelligence',
            'linear_insights',
            'linear_asks',
            'support_integrations',
            'triage_responsibility',
            'triage_routing',
          ],
          displayGroup: 'business',
          displayOrder: 1,
        },
        {
          product: {
            name: 'Business',
            default: false,
            description:
              '$192/user/year. All Basic features + unlimited teams, private teams, Product Intelligence, Linear Insights, Linear Asks, and support integrations.',
            slug: 'business_yearly',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'business_yearly',
              isDefault: true,
              name: 'Business Plan (Yearly)',
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
            'unlimited_members',
            'slack_github',
            'ai_agents',
            'api_webhooks',
            'import_export',
            'triage',
            'customer_requests',
            'issue_sync',
            'unlimited_issues',
            'unlimited_file_uploads',
            'admin_roles',
            'issue_slas',
            'unlimited_teams',
            'private_teams',
            'product_intelligence',
            'linear_insights',
            'linear_asks',
            'support_integrations',
            'triage_responsibility',
            'triage_routing',
          ],
          displayGroup: 'business',
          displayOrder: 2,
        },
        {
          product: {
            name: 'Enterprise',
            default: false,
            description:
              'Custom pricing. All Business features + sub-initiatives, advanced Linear Asks, dashboards, SAML/SCIM, advanced security, and dedicated support.',
            slug: 'enterprise',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'enterprise_yearly',
              isDefault: true,
              name: 'Enterprise Plan (Yearly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Year,
              intervalCount: 1,
              unitPrice: 24000, // Placeholder price - actual pricing is custom
            },
          ],
          features: [
            'unlimited_members',
            'slack_github',
            'ai_agents',
            'api_webhooks',
            'import_export',
            'triage',
            'customer_requests',
            'issue_sync',
            'unlimited_issues',
            'unlimited_file_uploads',
            'admin_roles',
            'issue_slas',
            'unlimited_teams',
            'private_teams',
            'product_intelligence',
            'linear_insights',
            'linear_asks',
            'support_integrations',
            'triage_responsibility',
            'triage_routing',
            'sub_initiatives',
            'advanced_linear_asks',
            'dashboards',
            'saml_sso',
            'scim_provisioning',
            'advanced_security',
            'migration_support',
            'priority_support',
            'account_manager',
          ],
        },
      ],
    },
  }

/**
 * AI Meeting Notes Subscription Template
 * Used by: Granola
 * Model: Per-user pricing with tiered features. Meeting notes tool with history limits on free tier.
 */
export const AI_MEETING_NOTES_SUBSCRIPTION_TEMPLATE: PricingModelTemplate =
  {
    metadata: {
      id: 'ai_meeting_notes_subscription',
      title: 'AI meeting notes subscription',
      description:
        'Per-user pricing for AI meeting notes. Free tier with limited history, paid tiers unlock unlimited notes and advanced features.',
      icon: Sparkles,
      features: [
        {
          icon: UserPlus,
          text: 'Per-user pricing model',
        },
        {
          icon: Clock,
          text: 'History limits on free tier',
        },
        {
          icon: Layers,
          text: 'Enterprise security & SSO',
        },
      ],
      usedBy: {
        name: 'Granola',
        logo: {
          svg: '<svg width="68" height="26" viewBox="0 0 68 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.37282 16.9467C6.82832 16.9467 6.93763 16.9282 7.21093 16.9282C8.10371 16.9282 8.74142 17.5205 8.74142 18.4091C8.74142 19.4086 7.86686 20.0935 6.60967 20.0935C5.37072 20.0935 4.24108 19.4456 3.58515 18.4091L2 19.8529C2.87456 21.2966 4.56903 22.1666 6.55503 22.1666C9.21514 22.1666 11.0372 20.5933 11.0372 18.3535C11.0372 17.0948 10.4723 15.9842 9.57955 15.5399V15.4844C10.2537 15.0031 10.7092 14.0776 10.7092 13.041C10.7092 12.171 10.3812 11.4121 9.81641 10.8383H10.1808L11.0189 9.2094V9.11684H6.57323C4.14997 9.11684 2.41906 10.7272 2.41906 13.0225C2.41906 15.2993 4.14997 16.9467 6.37282 16.9467ZM4.66012 13.0225C4.66012 11.9859 5.46182 11.153 6.55503 11.153C7.66644 11.153 8.48634 12.0044 8.48634 13.0225C8.48634 14.0961 7.66644 14.9106 6.55503 14.9106C5.44359 14.9106 4.66012 14.0961 4.66012 13.0225Z" fill="black"/><path d="M17.5414 9.11684C16.5211 9.11684 15.6648 9.48704 15.2457 10.1349H15.1546V9.11684H12.7313V18.4646H15.2275V13.2446C15.2275 12.06 16.1202 11.264 17.5414 11.264V9.11684Z" fill="black"/><path d="M23.5888 17.8722L23.6617 18.4645H25.9392V12.0414C25.9392 9.78313 24.8277 8.87614 21.9854 8.87614C21.1291 8.87614 20.3091 8.95017 19.5074 9.15378L19.2159 11.264C19.8537 11.0233 20.7647 10.8567 21.5845 10.8567C22.8781 10.8567 23.4612 11.301 23.4612 12.2265V12.7263C22.951 12.3561 22.2222 12.134 21.3841 12.134C19.3435 12.134 17.9222 13.4482 17.9222 15.4103C17.9222 17.3724 19.3253 18.7421 21.3295 18.7421C22.2769 18.7421 23.0421 18.4275 23.4977 17.8722H23.5888ZM20.2909 15.3733C20.2909 14.5218 20.9833 13.8924 21.9489 13.8924C22.8964 13.8924 23.5706 14.5218 23.5706 15.3733C23.5706 16.2618 22.8964 16.8911 21.9489 16.8911C20.9833 16.8911 20.2909 16.2618 20.2909 15.3733Z" fill="black"/><path d="M35.882 18.4646V11.9304C35.882 10.0979 34.6611 8.83918 32.8027 8.83918C31.6913 8.83918 30.744 9.30194 30.3067 9.9683H30.2337V9.11684H27.7922V18.4646H30.2884V12.8559C30.2884 11.6898 30.9262 10.9494 31.9463 10.9494C32.8574 10.9494 33.404 11.5602 33.404 12.6708V18.4646H35.882Z" fill="black"/><path d="M37.2645 13.7814C37.2645 16.6875 39.2868 18.7422 42.2202 18.7422C45.1537 18.7422 47.1761 16.6875 47.1761 13.7814C47.1761 10.8938 45.1537 8.83918 42.2202 8.83918C39.2868 8.83918 37.2645 10.8938 37.2645 13.7814ZM39.5602 13.7629C39.5602 12.134 40.6715 10.9309 42.2202 10.9309C43.7689 10.9309 44.8804 12.134 44.8804 13.7629C44.8804 15.4474 43.7689 16.6505 42.2202 16.6505C40.6715 16.6505 39.5602 15.4474 39.5602 13.7629Z" fill="black"/><path d="M51.151 5.41493H48.6549V18.4647H51.151V5.41493Z" fill="black"/><path d="M58.3136 17.8722L58.3865 18.4645H60.664V12.0414C60.664 9.78313 59.5527 8.87614 56.7103 8.87614C55.854 8.87614 55.0341 8.95017 54.2323 9.15378L53.9409 11.264C54.5786 11.0233 55.4897 10.8567 56.3095 10.8567C57.6031 10.8567 58.1862 11.301 58.1862 12.2265V12.7263C57.676 12.3561 56.9471 12.134 56.109 12.134C54.0684 12.134 52.6473 13.4482 52.6473 15.4103C52.6473 17.3724 54.0503 18.7421 56.0544 18.7421C57.0017 18.7421 57.7672 18.4275 58.2227 17.8722H58.3136ZM55.0159 15.3733C55.0159 14.5218 55.7082 13.8924 56.6738 13.8924C57.6213 13.8924 58.2953 14.5218 58.2953 15.3733C58.2953 16.2618 57.6213 16.8911 56.6738 16.8911C55.7082 16.8911 55.0159 16.2618 55.0159 15.3733Z" fill="black"/><path d="M63.7195 2C62.9564 2 62.3379 2.62001 62.3379 3.38483V22.3716C62.3379 23.1364 62.9564 23.7564 63.7195 23.7564C64.4825 23.7564 65.1011 23.1364 65.1011 22.3716V3.38483C65.1011 2.62001 64.4825 2 63.7195 2Z" fill="black"/></svg>',
        },
      },
    },
    input: {
      name: 'AI Meeting Notes Subscription',
      isDefault: false,

      // Usage Meters - None needed for seat-based billing
      usageMeters: [],

      // Features
      features: [
        // Basic (Free) tier features
        {
          type: FeatureType.Toggle,
          slug: 'ai_meeting_notes',
          name: 'AI Meeting Notes',
          description: 'AI-powered meeting notes and transcription',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: '14_day_history',
          name: '14 Days of Meeting History',
          description: 'Access meeting notes from the last 14 days',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'ai_chat',
          name: 'AI Chat',
          description: 'AI chat within and across meetings',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'shared_folders',
          name: 'Shared Folders',
          description: 'Shared folders for team collaboration',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'custom_templates',
          name: 'Customized Note Templates',
          description:
            'Create custom templates for your meeting notes',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'multi_language',
          name: 'Multi-language Support',
          description: 'Support for multiple languages',
          active: true,
        },

        // Business tier features
        {
          type: FeatureType.Toggle,
          slug: 'unlimited_history',
          name: 'Unlimited Meeting History',
          description: 'Access unlimited meeting notes and history',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'advanced_ai_models',
          name: 'Advanced AI Thinking Models',
          description:
            'Access to advanced AI models for better insights',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'advanced_integrations',
          name: 'Advanced Integrations',
          description:
            'Integrate with Attio, Notion, Slack, Hubspot, Affinity, and Zapier',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'centralized_billing',
          name: 'Centralized Billing & User Management',
          description:
            'Manage billing and users from a central dashboard',
          active: true,
        },

        // Enterprise tier features
        {
          type: FeatureType.Toggle,
          slug: 'enterprise_security',
          name: 'Enterprise-grade Security & Admin Controls',
          description:
            'Advanced security features and admin controls',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'sso',
          name: 'Single Sign-on (SSO)',
          description: 'SSO authentication for your organization',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'priority_support',
          name: 'Priority Support',
          description:
            'Priority customer support and usage analytics',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'auto_deletion',
          name: 'Org-wide Auto-deletion Periods',
          description: 'Set automatic deletion periods for all users',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'link_sharing_controls',
          name: 'Admin Controls for Meeting Link Sharing',
          description:
            'Control how meeting links are shared across your organization',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'opt_out_training',
          name: 'Opt Out of Model Training',
          description:
            'Opt out of AI model training for your entire team',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'participant_messaging',
          name: 'Org-wide Participant Messaging',
          description:
            'Notify other meeting participants that Granola is being used',
          active: true,
        },
      ],

      // Products
      products: [
        {
          product: {
            name: 'Basic',
            default: true,
            description:
              'Free to try Granola. AI meeting notes, 14 days of history, AI chat, shared folders, and customized templates.',
            slug: 'basic',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'basic_plan',
              isDefault: true,
              name: 'Basic Plan',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 0,
            },
          ],
          features: [
            'ai_meeting_notes',
            '14_day_history',
            'ai_chat',
            'shared_folders',
            'custom_templates',
            'multi_language',
          ],
        },
        {
          product: {
            name: 'Business',
            default: false,
            description:
              '$14/user/month. Everything in Basic + unlimited history, advanced AI models, advanced integrations, and centralized billing.',
            slug: 'business',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'business_monthly',
              isDefault: true,
              name: 'Business Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 1400,
            },
          ],
          features: [
            'ai_meeting_notes',
            '14_day_history',
            'ai_chat',
            'shared_folders',
            'custom_templates',
            'multi_language',
            'unlimited_history',
            'advanced_ai_models',
            'advanced_integrations',
            'centralized_billing',
          ],
        },
        {
          product: {
            name: 'Enterprise',
            default: false,
            description:
              '$35/user/month. Everything in Business + enterprise security, SSO, priority support, admin controls, and compliance features.',
            slug: 'enterprise',
            active: true,
            imageURL: null,
            singularQuantityLabel: 'user',
            pluralQuantityLabel: 'users',
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'enterprise_monthly',
              isDefault: true,
              name: 'Enterprise Plan (Monthly)',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 3500,
            },
          ],
          features: [
            'ai_meeting_notes',
            '14_day_history',
            'ai_chat',
            'shared_folders',
            'custom_templates',
            'multi_language',
            'unlimited_history',
            'advanced_ai_models',
            'advanced_integrations',
            'centralized_billing',
            'enterprise_security',
            'sso',
            'priority_support',
            'auto_deletion',
            'link_sharing_controls',
            'opt_out_training',
            'participant_messaging',
          ],
        },
      ],
    },
  }

/**
 * AI Token Usage Template
 * Recommended for: AI API Wrappers
 * Model: Token-based usage pricing with tiered subscriptions including monthly token credits.
 */
export const AI_TOKEN_USAGE_TEMPLATE: PricingModelTemplate = {
  metadata: {
    id: 'ai_token_usage',
    title: 'AI Token Usage',
    description:
      'Token-based pricing for AI APIs. Subscriptions include monthly token credits with pay-as-you-go overages. Ideal for LLM gateways and API wrappers.',
    icon: Coins,
    features: [
      {
        icon: Database,
        text: 'Tiered token packages',
      },
      {
        icon: Repeat,
        text: 'Monthly token refresh',
      },
      {
        icon: TrendingUp,
        text: 'Usage-based overages',
      },
    ],
    usedBy: {
      name: 'Recommended for AI API Wrappers',
      logo: '',
    },
  },
  input: {
    name: 'AI Token Usage',
    isDefault: false,

    // Usage Meters
    usageMeters: [
      {
        slug: 'api_tokens',
        name: 'API Tokens',
      },
    ],

    // Features
    features: [
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'starter_tokens',
        name: '100K API Tokens',
        description: '100,000 API tokens included per month',
        usageMeterSlug: 'api_tokens',
        amount: 100000,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'pro_tokens',
        name: '500K API Tokens',
        description: '500,000 API tokens included per month',
        usageMeterSlug: 'api_tokens',
        amount: 500000,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.UsageCreditGrant,
        slug: 'business_tokens',
        name: '2M API Tokens',
        description: '2,000,000 API tokens included per month',
        usageMeterSlug: 'api_tokens',
        amount: 2000000,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'standard_support',
        name: 'Standard Support',
        description: 'Email support with 24-hour response time',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'priority_support',
        name: 'Priority Support',
        description: 'Priority email and chat support',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'dedicated_support',
        name: 'Dedicated Support',
        description: 'Dedicated account manager and support',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'api_access',
        name: 'API Access',
        description: 'Full API access with authentication',
        active: true,
      },
      {
        type: FeatureType.Toggle,
        slug: 'rate_limiting',
        name: 'Higher Rate Limits',
        description: 'Increased API rate limits',
        active: true,
      },
    ],

    // Products
    products: [
      {
        product: {
          name: 'Free',
          default: true,
          description: 'Try it out with 10K tokens per month',
          slug: 'free_tier',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'free_monthly',
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
        features: ['api_access'],
      },
      {
        product: {
          name: 'Starter',
          default: false,
          description: '$19/mo with 100K tokens included',
          slug: 'starter_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'starter_monthly',
            isDefault: true,
            name: 'Starter Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: 14,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 1900,
          },
        ],
        features: [
          'starter_tokens',
          'api_access',
          'standard_support',
        ],
        displayGroup: 'starter',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Starter',
          default: false,
          description: '$228/yr with 100K tokens included',
          slug: 'starter_yearly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'starter_yearly',
            isDefault: true,
            name: 'Starter Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: 14,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 22800,
          },
        ],
        features: [
          'starter_tokens',
          'api_access',
          'standard_support',
        ],
        displayGroup: 'starter',
        displayOrder: 2,
      },
      {
        product: {
          name: 'Pro',
          default: false,
          description: '$79/mo with 500K tokens + priority support',
          slug: 'pro_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_monthly',
            isDefault: true,
            name: 'Pro Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: 14,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 7900,
          },
        ],
        features: [
          'pro_tokens',
          'api_access',
          'rate_limiting',
          'priority_support',
        ],
        displayGroup: 'pro',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Pro',
          default: false,
          description: '$948/yr with 500K tokens + priority support',
          slug: 'pro_yearly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'pro_yearly',
            isDefault: true,
            name: 'Pro Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: 14,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 94800,
          },
        ],
        features: [
          'pro_tokens',
          'api_access',
          'rate_limiting',
          'priority_support',
        ],
        displayGroup: 'pro',
        displayOrder: 2,
      },
      {
        product: {
          name: 'Business',
          default: false,
          description: '$299/mo with 2M tokens + dedicated support',
          slug: 'business_monthly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_monthly',
            isDefault: true,
            name: 'Business Plan (Monthly)',
            usageMeterId: null,
            trialPeriodDays: 14,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 29900,
          },
        ],
        features: [
          'business_tokens',
          'api_access',
          'rate_limiting',
          'dedicated_support',
        ],
        displayGroup: 'business',
        displayOrder: 1,
      },
      {
        product: {
          name: 'Business',
          default: false,
          description: '$3,588/yr with 2M tokens + dedicated support',
          slug: 'business_yearly',
          active: true,
          imageURL: null,
          singularQuantityLabel: null,
          pluralQuantityLabel: null,
        },
        prices: [
          {
            type: PriceType.Subscription,
            slug: 'business_yearly',
            isDefault: true,
            name: 'Business Plan (Yearly)',
            usageMeterId: null,
            trialPeriodDays: 14,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Year,
            intervalCount: 1,
            unitPrice: 358800,
          },
        ],
        features: [
          'business_tokens',
          'api_access',
          'rate_limiting',
          'dedicated_support',
        ],
        displayGroup: 'business',
        displayOrder: 2,
      },
      {
        product: {
          name: 'Token Overages',
          default: false,
          description:
            'Additional tokens billed at cost after included credits exhausted',
          slug: 'token_overages',
          active: true,
          imageURL: null,
          singularQuantityLabel: 'token',
          pluralQuantityLabel: 'tokens',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'token_overage',
            isDefault: true,
            name: 'Token Overage',
            usageMeterSlug: 'api_tokens',
            trialPeriodDays: null,
            usageEventsPerUnit: 1000,
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
 * All available pricing model templates
 */
export const PRICING_MODEL_TEMPLATES: ReadonlyArray<PricingModelTemplate> =
  [
    USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
    UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
    CREDITS_SUBSCRIPTION_TEMPLATE,
    AI_IMAGE_GENERATION_SUBSCRIPTION_TEMPLATE,
    SEAT_BASED_SUBSCRIPTION_TEMPLATE,
    AI_MEETING_NOTES_SUBSCRIPTION_TEMPLATE,
    AI_TOKEN_USAGE_TEMPLATE,
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
