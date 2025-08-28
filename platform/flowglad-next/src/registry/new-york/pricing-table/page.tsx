'use client'

import * as React from 'react'
import { PricingTable } from './pricing-table'
import type { PricingProduct } from './types'

const sampleProducts: PricingProduct[] = [
  {
    name: 'Personal',
    slug: 'personal',
    tiers: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        period: 'month',
        description: 'Intelligence for everyday tasks',
        current: true,
        cta: {
          text: 'Your current plan',
          disabled: true
        },
        features: [
          { text: 'Access to GPT-5', included: true },
          { text: 'Limited file uploads', included: true },
          { text: 'Limited and slower image generation', included: true },
          { text: 'Limited memory and context', included: true },
          { text: 'Limited deep research', included: true }
        ],
        footnote: 'Have an existing plan? See billing help'
      },
      {
        id: 'plus',
        name: 'Plus',
        price: 20,
        currency: 'USD',
        period: 'month',
        description: 'More access to advanced intelligence',
        popular: true,
        cta: {
          text: 'Get Plus'
        },
        features: [
          { text: 'GPT-5 with advanced reasoning', included: true },
          { text: 'Expanded messaging and uploads', included: true },
          { text: 'Expanded and faster image creation', included: true },
          { text: 'Expanded memory and context', included: true },
          { text: 'Expanded deep research and agent mode', included: true },
          { text: 'Projects, tasks, custom GPTs', included: true },
          { text: 'Sora video generation', included: true },
          { text: 'Codex agent', included: true }
        ]
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 200,
        currency: 'USD',
        period: 'month',
        description: 'Full access to the best of ChatGPT',
        cta: {
          text: 'Get Pro'
        },
        features: [
          { text: 'GPT-5 with pro reasoning', included: true },
          { text: 'Unlimited messages and uploads', included: true },
          { text: 'Unlimited and faster image creation', included: true },
          { text: 'Maximum memory and context', included: true },
          { text: 'Maximum deep research and agent mode', included: true },
          { text: 'Expanded projects, tasks, and custom GPTs', included: true },
          { text: 'Expanded Sora video generation', included: true },
          { text: 'Expanded Codex agent', included: true },
          { text: 'Research preview of new features', included: true }
        ],
        footnote: 'Unlimited subject to abuse guardrails. Learn more'
      }
    ]
  },
  {
    name: 'Business',
    slug: 'business',
    tiers: [
      {
        id: 'team',
        name: 'Team',
        price: 25,
        currency: 'USD',
        period: 'month',
        description: 'Collaborate with your team',
        cta: {
          text: 'Get Team'
        },
        features: [
          { text: 'Everything in Plus', included: true },
          { text: 'Team workspace', included: true },
          { text: 'Admin console', included: true },
          { text: 'Team data excluded from training', included: true },
          { text: 'Priority support', included: true }
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 60,
        currency: 'USD',
        period: 'month',
        description: 'Advanced security and controls',
        popular: true,
        cta: {
          text: 'Contact Sales'
        },
        features: [
          { text: 'Everything in Team', included: true },
          { text: 'Unlimited workspaces', included: true },
          { text: 'SSO and domain verification', included: true },
          { text: 'Advanced data analysis', included: true },
          { text: 'Extended context windows', included: true },
          { text: 'Custom data retention', included: true },
          { text: 'Enterprise agreements', included: true },
          { text: 'Dedicated support', included: true }
        ]
      },
      {
        id: 'custom',
        name: 'Custom',
        price: 0,
        currency: '',
        period: 'month',
        description: 'Tailored for your organization',
        cta: {
          text: 'Contact Us'
        },
        features: [
          { text: 'Everything in Enterprise', included: true },
          { text: 'Custom model training', included: true },
          { text: 'Dedicated infrastructure', included: true },
          { text: 'Custom integrations', included: true },
          { text: 'White-glove onboarding', included: true },
          { text: 'Custom SLAs', included: true }
        ],
        footnote: 'Contact us for custom pricing'
      }
    ]
  }
]

export default function PricingTableDemo() {
  const handleTierSelect = (tierId: string, productSlug: string) => {
    console.log(`Selected tier: ${tierId} from product: ${productSlug}`)
    // Handle tier selection (e.g., navigate to checkout, show modal, etc.)
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Pricing Table Component</h1>
          <p className="text-lg text-muted-foreground">
            A responsive pricing table component with multiple products and tiers
          </p>
        </div>
        
        <PricingTable
          products={sampleProducts}
          currentProductSlug="personal"
          onTierSelect={handleTierSelect}
          showToggle={true}
        />
      </div>
    </div>
  )
}