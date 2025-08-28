'use client'
import { PricingTable } from '@/registry/new-york/pricing-table'
import type { PricingProduct } from '@/registry/new-york/pricing-table/types'

const InternalDemoPage = () => {
  const products: PricingProduct[] = [
    {
      name: 'Personal',
      slug: 'personal',
      tiers: [
        {
          id: 'personal-free',
          name: 'Free',
          price: 0,
          currency: 'USD',
          period: 'month',
          description: 'Basic tools to explore the platform.',
          features: [
            { text: 'Single user', included: true },
            { text: 'Community support', included: true },
            { text: 'Usage limits apply', included: true, tooltip: 'Reasonable monthly limits for evaluation' },
            { text: 'Advanced analytics', included: false },
          ],
          cta: { text: 'Get started', variant: 'default' },
          footnote: 'No credit card required',
          current: true,
        },
        {
          id: 'personal-pro',
          name: 'Pro',
          price: 20,
          currency: 'USD',
          period: 'month',
          description: 'For individuals who need more power and higher limits.',
          features: [
            { text: 'Single user', included: true },
            { text: 'Priority email support', included: true },
            { text: 'Higher usage limits', included: true },
            { text: 'Advanced analytics', included: true },
          ],
          cta: { text: 'Upgrade to Pro', variant: 'default' },
          popular: true,
          footnote: 'Billed monthly',
        },
        {
          id: 'personal-max',
          name: 'Max',
          price: 40,
          currency: 'USD',
          period: 'month',
          description: 'All features for power users with maximum limits.',
          features: [
            { text: 'Single user', included: true },
            { text: 'Priority support', included: true },
            { text: 'Maximum usage limits', included: true },
            { text: 'Advanced analytics & exports', included: true },
          ],
          cta: { text: 'Go Max', variant: 'default' },
          footnote: 'Best for heavy personal usage',
        },
      ],
    },
    {
      name: 'Team',
      slug: 'team',
      tiers: [
        {
          id: 'team-starter',
          name: 'Starter',
          price: 49,
          currency: 'USD',
          period: 'month',
          description: 'Everything you need to collaborate as a small team.',
          features: [
            { text: 'Up to 5 seats', included: true },
            { text: 'Role-based access', included: true },
            { text: 'Shared workspaces', included: true },
            { text: 'Basic analytics', included: true },
          ],
          cta: { text: 'Choose Starter', variant: 'default' },
        },
        {
          id: 'team-growth',
          name: 'Growth',
          price: 99,
          currency: 'USD',
          period: 'month',
          description: 'For growing teams that need advanced controls and insights.',
          features: [
            { text: 'Up to 20 seats', included: true },
            { text: 'SSO (SAML)', included: true },
            { text: 'Advanced analytics', included: true },
            { text: 'Priority support', included: true },
          ],
          cta: { text: 'Choose Growth', variant: 'default' },
          popular: true,
          footnote: 'Most teams choose this',
        },
        {
          id: 'team-enterprise',
          name: 'Enterprise',
          price: 0,
          currency: 'USD',
          period: 'month',
          description: 'Custom pricing for large organizations with advanced needs.',
          features: [
            { text: 'Unlimited seats', included: true },
            { text: 'Dedicated support & SLA', included: true },
            { text: 'Security reviews', included: true },
            { text: 'Custom contracts', included: true },
          ],
          cta: { text: 'Contact sales', variant: 'outline' },
          footnote: 'Custom pricing',
        },
      ],
    },
  ]

  return <PricingTable
        products={products}
        currentProductSlug="personal"
        onTierSelect={() => {
          // Handle tier selection
        }}
        showToggle={true}
      />
}

export default InternalDemoPage
