import { PricingTable } from '@/registry/base/pricing/pricing-table'
import type { PricingProductGroup } from '@/registry/base/pricing/types'

const personalProductGroup: PricingProductGroup = {
  name: 'Personal',
  slug: 'personal',
  products: [
    {
      slug: 'free',
      name: 'Free',
      price: {
        unitAmount: 0,
        currency: 'USD',
        intervalUnit: 'month',
        intervalCount: 1,
      },
      description: 'Intelligence for everyday tasks',
      current: true,
      cta: { text: 'Your current plan', disabled: true },
      features: [
        { text: 'Access to GPT-5', included: true },
        { text: 'Limited file uploads', included: true },
        {
          text: 'Limited and slower image generation',
          included: true,
        },
        { text: 'Limited memory and context', included: true },
        { text: 'Limited deep research', included: true },
      ],
      footnote: 'Have an existing plan? See billing help',
    },
    {
      slug: 'plus',
      name: 'Plus',
      price: {
        unitAmount: 2000, // $20.00 in cents
        currency: 'USD',
        intervalUnit: 'month',
        intervalCount: 1,
      },
      description: 'More access to advanced intelligence',
      popular: true,
      cta: { text: 'Get Plus' },
      features: [
        { text: 'GPT-5 with advanced reasoning', included: true },
        { text: 'Expanded messaging and uploads', included: true },
        {
          text: 'Expanded and faster image creation',
          included: true,
        },
        { text: 'Expanded memory and context', included: true },
        {
          text: 'Expanded deep research and agent mode',
          included: true,
        },
        { text: 'Projects, tasks, custom GPTs', included: true },
        { text: 'Sora video generation', included: true },
        { text: 'Codex agent', included: true },
      ],
    },
    {
      slug: 'pro',
      name: 'Pro',
      price: {
        unitAmount: 20000, // $200.00 in cents
        currency: 'USD',
        intervalUnit: 'month',
        intervalCount: 1,
      },
      description: 'Full access to the best of ChatGPT',
      cta: { text: 'Get Pro' },
      features: [
        { text: 'GPT-5 with pro reasoning', included: true },
        { text: 'Unlimited messages and uploads', included: true },
        {
          text: 'Unlimited and faster image creation',
          included: true,
        },
        { text: 'Maximum memory and context', included: true },
        {
          text: 'Maximum deep research and agent mode',
          included: true,
        },
        {
          text: 'Expanded projects, tasks, and custom GPTs',
          included: true,
        },
        { text: 'Expanded Sora video generation', included: true },
        { text: 'Expanded Codex agent', included: true },
        { text: 'Research preview of new features', included: true },
      ],
      footnote: 'Unlimited subject to abuse guardrails. Learn more',
    },
  ],
}

const businessProductGroup: PricingProductGroup = {
  name: 'Business',
  slug: 'business',
  products: [
    {
      slug: 'team',
      name: 'Team',
      price: {
        unitAmount: 2500, // $25.00 in cents
        currency: 'USD',
        intervalUnit: 'month',
        intervalCount: 1,
      },
      description: 'Collaborate with your team',
      cta: { text: 'Get Team' },
      features: [
        { text: 'Everything in Plus', included: true },
        { text: 'Team workspace', included: true },
        { text: 'Admin console', included: true },
        { text: 'Team data excluded from training', included: true },
        { text: 'Priority support', included: true },
      ],
    },
    {
      slug: 'enterprise',
      name: 'Enterprise',
      price: {
        unitAmount: 6000, // $60.00 in cents
        currency: 'USD',
        intervalUnit: 'month',
        intervalCount: 1,
      },
      description: 'Advanced security and controls',
      popular: true,
      cta: { text: 'Contact Sales' },
      features: [
        { text: 'Everything in Team', included: true },
        { text: 'Unlimited workspaces', included: true },
        { text: 'SSO and domain verification', included: true },
        { text: 'Advanced data analysis', included: true },
        { text: 'Extended context windows', included: true },
        { text: 'Custom data retention', included: true },
        { text: 'Enterprise agreements', included: true },
        { text: 'Dedicated support', included: true },
      ],
    },
    {
      slug: 'custom',
      name: 'Custom',
      price: {
        unitAmount: 0,
        currency: 'USD',
        intervalUnit: 'month',
        intervalCount: 1,
      },
      description: 'Tailored for your organization',
      cta: { text: 'Contact Us' },
      features: [
        { text: 'Everything in Enterprise', included: true },
        { text: 'Custom model training', included: true },
        { text: 'Dedicated infrastructure', included: true },
        { text: 'Custom integrations', included: true },
        { text: 'White-glove onboarding', included: true },
        { text: 'Custom SLAs', included: true },
      ],
      footnote: 'Contact us for custom pricing',
    },
  ],
}

export const registryComponents = [
  {
    name: 'pricing-table',
    displayName: 'PricingTable',
    description:
      'A responsive pricing table component with product toggle and tier selection',
    component: PricingTable,
    defaultProps: {
      productGroups: [personalProductGroup, businessProductGroup],
      currentGroupSlug: 'personal',
      showToggle: true,
      onProductSelect: () => {
        // Handle product selection
      },
    },
    variants: [
      {
        name: 'Personal Plans',
        props: {
          productGroups: [personalProductGroup],
          currentGroupSlug: 'personal',
          showToggle: false,
          onProductSelect: () => {
            // Handle product selection
          },
        },
      },
      {
        name: 'Business Plans',
        props: {
          productGroups: [businessProductGroup],
          currentGroupSlug: 'business',
          showToggle: false,
          onProductSelect: () => {
            // Handle product selection
          },
        },
      },
      {
        name: 'All Plans with Toggle',
        props: {
          productGroups: [personalProductGroup, businessProductGroup],
          currentGroupSlug: 'personal',
          showToggle: true,
          onProductSelect: () => {
            // Handle product selection
          },
        },
      },
    ],
  },
]

// Future components can be added here:
// {
//   name: 'hello-world',
//   displayName: 'HelloWorld',
//   description: 'A simple hello world component',
//   component: HelloWorld,
//   defaultProps: {},
//   variants: []
// }
