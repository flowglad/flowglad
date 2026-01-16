'use client'

import {
  Command,
  LayoutGrid,
  Mail,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { DemoTeamSwitcher } from './DemoTeamSwitcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from './demo-sidebar'
import {
  type EmailType,
  getEmailType,
  getViewType,
  type ParsedParams,
  type ViewType,
} from './mockData'

// ============================================================================
// Team Data for Switcher
// ============================================================================

const demoTeams = [
  {
    name: 'Demo Tools',
    logo: Command,
    plan: 'Email & Component Previews',
  },
  {
    name: 'Flowglad',
    logo: Sparkles,
    plan: 'Production',
  },
]

// ============================================================================
// Types
// ============================================================================

interface NavItem {
  href: string
  label: string
  emailType: EmailType
  /** Additional conditions for active state beyond emailType match */
  activeCondition?: (params: ParsedParams) => boolean
}

// ============================================================================
// Navigation Configuration
// ============================================================================

const emailItems: NavItem[] = [
  // Order/Payment emails
  {
    href: '/demo-route?email=order-receipt&mor=true',
    label: 'Order Receipt (MoR)',
    emailType: 'order-receipt',
    activeCondition: (p) => p.isMoR,
  },
  {
    href: '/demo-route?email=order-receipt&mor=false',
    label: 'Order Receipt',
    emailType: 'order-receipt',
    activeCondition: (p) => !p.isMoR,
  },
  {
    href: '/demo-route?email=payment-failed&hasRetry=true',
    label: 'Payment Failed (With Retry)',
    emailType: 'payment-failed',
    activeCondition: (p) => p.hasRetry,
  },
  {
    href: '/demo-route?email=payment-failed&hasRetry=false',
    label: 'Payment Failed (No Retry)',
    emailType: 'payment-failed',
    activeCondition: (p) => !p.hasRetry,
  },
  // Subscription lifecycle emails
  {
    href: '/demo-route?email=subscription-created',
    label: 'Subscription Created',
    emailType: 'subscription-created',
  },
  {
    href: '/demo-route?email=subscription-upgraded',
    label: 'Subscription Upgraded (Free → Paid)',
    emailType: 'subscription-upgraded',
    activeCondition: (p) => !p.isTrialing,
  },
  {
    href: '/demo-route?email=subscription-upgraded&trialing=true',
    label: 'Subscription Upgraded (Trial)',
    emailType: 'subscription-upgraded',
    activeCondition: (p) => p.isTrialing,
  },
  {
    href: '/demo-route?email=subscription-adjusted-upgrade',
    label: 'Subscription Adjusted (Upgrade)',
    emailType: 'subscription-adjusted-upgrade',
  },
  {
    href: '/demo-route?email=subscription-adjusted-downgrade',
    label: 'Subscription Adjusted (Downgrade)',
    emailType: 'subscription-adjusted-downgrade',
  },
  {
    href: '/demo-route?email=subscription-canceled',
    label: 'Subscription Canceled',
    emailType: 'subscription-canceled',
  },
  {
    href: '/demo-route?email=subscription-cancellation-scheduled',
    label: 'Cancellation Scheduled',
    emailType: 'subscription-cancellation-scheduled',
  },
  // Authentication emails
  {
    href: '/demo-route?email=billing-portal-otp',
    label: 'Billing Portal OTP',
    emailType: 'billing-portal-otp',
  },
  {
    href: '/demo-route?email=billing-portal-magic-link',
    label: 'Billing Portal Magic Link',
    emailType: 'billing-portal-magic-link',
  },
  {
    href: '/demo-route?email=forgot-password',
    label: 'Forgot Password',
    emailType: 'forgot-password',
  },
  // Organization notification emails (admin-facing)
  {
    href: '/demo-route?email=org-subscription-created',
    label: 'Org: Subscription Created',
    emailType: 'org-subscription-created',
  },
  {
    href: '/demo-route?email=org-subscription-canceled',
    label: 'Org: Subscription Canceled',
    emailType: 'org-subscription-canceled',
  },
  {
    href: '/demo-route?email=org-subscription-cancellation-scheduled',
    label: 'Org: Cancellation Scheduled',
    emailType: 'org-subscription-cancellation-scheduled',
  },
  // Purchase access
  {
    href: '/demo-route?email=purchase-access-token',
    label: 'Purchase Access Token',
    emailType: 'purchase-access-token',
  },
]

// Separate components navigation (view-based, not email-based)
const componentItems = [
  {
    href: '/demo-route?view=pricing-table',
    label: 'Pricing Table',
    viewType: 'pricing-table' as ViewType,
  },
]

// ============================================================================
// Helper Functions
// ============================================================================

const parseSearchParams = (
  searchParams: URLSearchParams
): ParsedParams => ({
  isMoR: searchParams.get('mor') !== 'false',
  emailType: getEmailType(searchParams.get('email') ?? undefined),
  isTrialing: searchParams.get('trialing') === 'true',
  isTestMode: searchParams.get('testMode') === 'true',
  hasRetry: searchParams.get('hasRetry') !== 'false',
  viewType: getViewType(searchParams.get('view') ?? undefined),
})

const isLinkActive = (
  link: NavItem,
  params: ParsedParams
): boolean => {
  if (link.emailType !== params.emailType) return false
  if (link.activeCondition) return link.activeCondition(params)
  return true
}

// ============================================================================
// Component
// ============================================================================

export function DemoAppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const searchParams = useSearchParams()
  const params = parseSearchParams(searchParams)

  // Build href with testMode preserved
  const buildHref = (baseHref: string): string => {
    return params.isTestMode ? `${baseHref}&testMode=true` : baseHref
  }

  // Toggle test mode href - preserves all current query params
  const testModeHref = (() => {
    const currentParams = new URLSearchParams(searchParams.toString())
    if (params.isTestMode) {
      currentParams.delete('testMode')
    } else {
      currentParams.set('testMode', 'true')
    }
    return `/demo-route?${currentParams.toString()}`
  })()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <DemoTeamSwitcher teams={demoTeams} />
      </SidebarHeader>

      <SidebarContent>
        {/* Emails Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <Mail className="size-4" />
            Emails
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {emailItems.map((item) => {
                const isActive =
                  params.viewType === 'emails' &&
                  isLinkActive(item, params)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link
                        href={buildHref(item.href)}
                        title={item.label}
                      >
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Components Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <LayoutGrid className="size-4" />
            Components
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {componentItems.map((item) => {
                const isActive = params.viewType === item.viewType
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link
                        href={
                          params.isTestMode
                            ? `${item.href}&testMode=true`
                            : item.href
                        }
                        title={item.label}
                      >
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Toggle Test Mode">
              <Link
                href={testModeHref}
                className={
                  params.isTestMode
                    ? 'text-yellow-800 dark:text-yellow-200'
                    : ''
                }
              >
                <span className="truncate">
                  {params.isTestMode
                    ? 'Test Mode ON'
                    : 'Test Mode OFF'}
                </span>
                {params.isTestMode ? (
                  <ToggleRight className="ml-auto size-4" />
                ) : (
                  <ToggleLeft className="ml-auto size-4" />
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
