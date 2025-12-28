'use client'
import { useEffect } from 'react'
import { PricingTable } from '@/registry/base/pricing/pricing-table'
import type { PricingProductGroup } from '@/registry/base/pricing/types'
import { trpc } from '../_trpc/client'

/**
 * NOTE: The MoR email template preview was moved to a server component
 * because email templates import from @/db/schema/* which uses Node.js APIs.
 * To preview MoR emails, use the react-email dev server instead:
 *   cd platform/flowglad-next && bun run email:dev
 */

const InternalDemoPage = () => {
  const productGroups: PricingProductGroup[] = [
    {
      name: 'Personal',
      slug: 'personal',
      products: [
        {
          slug: 'personal-free',
          name: 'Free',
          price: {
            unitAmount: 0,
            currency: 'USD',
            intervalUnit: 'month',
            intervalCount: 1,
          },
          description: 'Basic tools to explore the platform.',
          features: [
            { text: 'Single user', included: true },
            { text: 'Community support', included: true },
            {
              text: 'Usage limits apply',
              included: true,
              tooltip: 'Reasonable monthly limits for evaluation',
            },
            { text: 'Advanced analytics', included: false },
          ],
          cta: { text: 'Get started', variant: 'default' },
          footnote: 'No credit card required',
          current: true,
        },
        {
          slug: 'personal-pro',
          name: 'Pro',
          price: {
            unitAmount: 20,
            currency: 'USD',
            intervalUnit: 'month',
            intervalCount: 1,
          },
          description:
            'For individuals who need more power and higher limits.',
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
          slug: 'personal-max',
          name: 'Max',
          price: {
            unitAmount: 40,
            currency: 'USD',
            intervalUnit: 'month',
            intervalCount: 1,
          },
          description:
            'All features for power users with maximum limits.',
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
      products: [
        {
          slug: 'team-starter',
          name: 'Starter',
          price: {
            unitAmount: 49,
            currency: 'USD',
            intervalUnit: 'month',
            intervalCount: 1,
          },
          description:
            'Everything you need to collaborate as a small team.',
          features: [
            { text: 'Up to 5 seats', included: true },
            { text: 'Role-based access', included: true },
            { text: 'Shared workspaces', included: true },
            { text: 'Basic analytics', included: true },
          ],
          cta: { text: 'Choose Starter', variant: 'default' },
        },
        {
          slug: 'team-growth',
          name: 'Growth',
          price: {
            unitAmount: 99,
            currency: 'USD',
            intervalUnit: 'month',
            intervalCount: 1,
          },
          description:
            'For growing teams that need advanced controls and insights.',
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
          slug: 'team-enterprise',
          name: 'Enterprise',
          price: {
            unitAmount: 0,
            currency: 'USD',
            intervalUnit: 'month',
            intervalCount: 1,
          },
          description:
            'Custom pricing for large organizations with advanced needs.',
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
  const { mutate: requestMagicLink } =
    trpc.customerBillingPortal.requestMagicLink.useMutation()
  useEffect(() => {
    requestMagicLink({
      organizationId: '123',
      email: 'test@test.com',
    })
    // FIXME(FG-384): Fix this warning:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <PricingTable
      productGroups={productGroups}
      currentGroupSlug="personal"
      onProductSelect={() => {
        // Handle product selection
      }}
      showToggle={true}
    />
  )
}

export default InternalDemoPage
