'use client'
import { Organization } from '@clerk/nextjs/server'
import { RiDiscordFill } from '@remixicon/react'
import {
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  DollarSign,
  Gauge,
  LogOut,
  type LucideIcon,
  PanelLeft,
  Settings,
  TriangleRight,
  Users,
} from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuthContext } from '@/contexts/authContext'
import { cn } from '@/lib/utils'
import { BusinessOnboardingStatus } from '@/types'
import { signOut } from '@/utils/authClient'
import { Skeleton } from '../ui/skeleton'
import { NavMain } from './NavMain'
import { NavStandalone } from './NavStandalone'
import OrganizationSwitcher from './OrganizationSwitcher'

type StandaloneNavItem = {
  title: string
  url: string
  icon?: LucideIcon | React.ComponentType<any>
  isActive?: boolean
}

type MainNavItem = {
  title: string
  url: string
  icon?: LucideIcon
  isActive?: boolean
  items?: {
    title: string
    url: string
  }[]
}

export const SideNavigation = () => {
  const pathname = usePathname()
  const { user, organization } = useAuthContext()
  const toggleTestMode = trpc.utils.toggleTestMode.useMutation({
    onSuccess: async () => {
      await invalidateTRPC()
      await focusedMembership.refetch()
      /**
       * Redirects the user back to `customers` page from
       * `customer/id` when switching between live/test mode to avoid
       * 404 or page crashes
       */
      if (pathname.startsWith('/customers/')) {
        router.push('/customers')
      }
      router.refresh()
    },
  })
  const { invalidate: invalidateTRPC } = trpc.useUtils()
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const [
    initialFocusedMembershipLoading,
    setInitialFocusedMembershipLoading,
  ] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const focusedMembershipData = focusedMembership.data
  useEffect(() => {
    if (focusedMembershipData) {
      setInitialFocusedMembershipLoading(false)
    }
  }, [focusedMembershipData])
  const livemode = focusedMembership.data?.membership.livemode
  const router = useRouter()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const fallbackInitials = (() => {
    const rawName = organization?.name?.trim()
    if (!rawName) {
      return 'FG'
    }
    const initials = rawName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? '')
      .join('')
    return initials || rawName[0]?.toUpperCase() || 'FG'
  })()

  const logoSize = isCollapsed ? 32 : 40

  const organizationLogo = organization?.logoURL ? (
    <Image
      className={cn(
        'rounded-full object-cover bg-white border border-border',
        isCollapsed ? 'h-8 w-8' : 'h-10 w-10'
      )}
      alt={organization?.name ?? 'Organization logo'}
      src={organization.logoURL}
      width={logoSize}
      height={logoSize}
    />
  ) : (
    <div
      className={cn(
        'flex items-center justify-center rounded-full border border-border bg-primary/10 text-primary font-semibold uppercase',
        isCollapsed ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
      )}
    >
      {fallbackInitials}
    </div>
  )

  const sidebarToggleLabel = isCollapsed
    ? 'Expand sidebar'
    : 'Collapse sidebar'

  const handleBrandClick = () => {
    if (isCollapsed) {
      toggleSidebar()
    }
  }

  // Helper function to check if a path is active
  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + '/')
  }

  // Onboarding setup item (conditional)
  const setupItem: StandaloneNavItem[] =
    organization?.onboardingStatus !==
    BusinessOnboardingStatus.FullyOnboarded
      ? [
          {
            title: 'Set Up',
            url: '/onboarding',
            icon: () => <TriangleRight color="orange" />,
            isActive: isActive('/onboarding'),
          },
        ]
      : []

  // Navigation items organized in requested order
  const dashboardItem: StandaloneNavItem[] = [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: Gauge,
      isActive: isActive('/dashboard'),
    },
  ]

  const customersItem: StandaloneNavItem[] = [
    {
      title: 'Customers',
      url: '/customers',
      icon: Users,
      isActive: isActive('/customers'),
    },
  ]

  const settingsItem: StandaloneNavItem[] = [
    {
      title: 'Settings',
      url: '/settings',
      icon: Settings,
      isActive: isActive('/settings'),
    },
  ]

  const pricingItem: StandaloneNavItem[] = [
    {
      title: 'Pricing',
      url: '/pricing-models',
      icon: DollarSign,
      isActive: isActive('/pricing-models'),
    },
  ]

  // Navigation sections with children (using official pattern)
  const navigationSections: MainNavItem[] = [
    {
      title: 'Finance',
      url: '/finance',
      icon: CircleDollarSign,
      isActive: isActive('/finance'),
      items: [
        { title: 'Payments', url: '/finance/payments' },
        { title: 'Subscriptions', url: '/finance/subscriptions' },
        { title: 'Invoices', url: '/finance/invoices' },
        { title: 'Purchases', url: '/finance/purchases' },
        { title: 'Discounts', url: '/finance/discounts' },
      ],
    },
  ]

  // Footer navigation items
  const footerNavigationItems: StandaloneNavItem[] = [
    {
      title: 'Discord',
      url: 'https://app.flowglad.com/invite-discord',
      icon: RiDiscordFill,
      isActive: false,
    },
    {
      title: 'Documentation',
      url: 'https://docs.flowglad.com',
      icon: BookOpen,
      isActive: false,
    },
    {
      title: 'Logout',
      url: '/logout',
      icon: LogOut,
      isActive: false,
    },
  ]

  return (
    <>
      <SidebarHeader
        className={cn(
          'w-full flex flex-row items-center bg-sidebar py-3 px-3 gap-3 transition-all duration-300',
          'justify-between'
        )}
      >
        <button
          type="button"
          onClick={handleBrandClick}
          className={cn(
            'flex items-center gap-3 min-w-0 flex-1 rounded-md bg-transparent p-0 text-left transition-colors',
            isCollapsed
              ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              : 'cursor-default'
          )}
          aria-label={isCollapsed ? sidebarToggleLabel : undefined}
          tabIndex={isCollapsed ? 0 : -1}
        >
          <div className="flex-shrink-0">{organizationLogo}</div>
          <div
            className={cn(
              'flex flex-col justify-center gap-0.5 whitespace-nowrap transition-all duration-300 min-w-0',
              isCollapsed
                ? 'opacity-0 max-w-0'
                : 'opacity-100 max-w-xs'
            )}
          >
            <div className="text-sm font-semibold text-foreground truncate">
              {organization?.name}
            </div>
            <div className="text-xs font-medium text-muted-foreground truncate">
              {organization?.tagline}
            </div>
          </div>
        </button>
        {!isCollapsed && (
          <div className="flex items-center gap-0">
            <OrganizationSwitcher />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => toggleSidebar()}
              aria-label={sidebarToggleLabel}
            >
              <PanelLeft></PanelLeft>
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="pt-3 bg-sidebar">
        <div className="px-0 bg-sidebar">
          {/* 1. Set up - Only shows when onboarding not complete */}
          {setupItem.length > 0 && (
            <NavStandalone items={setupItem} />
          )}

          {/* 2. Dashboard */}
          <NavStandalone items={dashboardItem} />

          {/* 3. Pricing */}
          <NavStandalone items={pricingItem} />

          {/* 4. Customers */}
          <NavStandalone items={customersItem} />

          {/* 5. Finance */}
          <NavMain items={[navigationSections[0]]} />

          {/* 6. Settings */}
          <NavStandalone items={settingsItem} />
        </div>
        <div className="flex-1" />
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex flex-col gap-0 px-0 overflow-hidden transition-all duration-300 ease-in-out bg-sidebar',
          isCollapsed
            ? 'opacity-0 max-h-0 pointer-events-none'
            : 'opacity-100'
        )}
      >
        <div className="px-0">
          {/* Footer navigation using official pattern */}
          <NavStandalone items={footerNavigationItems} />
        </div>
        {/* Test Mode Toggle - using official sidebar components */}
        <div className="px-0">
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                {initialFocusedMembershipLoading ? (
                  <Skeleton className="w-full h-8 rounded-md" />
                ) : (
                  <SidebarMenuButton
                    onClick={async () => {
                      await toggleTestMode.mutateAsync({
                        livemode: !livemode,
                      })
                    }}
                    disabled={
                      toggleTestMode.isPending ||
                      focusedMembership.isPending
                    }
                    tooltip="Test Mode"
                  >
                    <span
                      className={cn(
                        'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
                        isCollapsed
                          ? 'max-w-0 opacity-0 ml-0'
                          : 'max-w-xs opacity-100 truncate'
                      )}
                    >
                      {isCollapsed ? null : 'Test Mode'}
                    </span>
                    {!isCollapsed && (
                      <span className="ml-auto shrink-0">
                        <div
                          className={cn(
                            'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-sm transition-colors',
                            !livemode ? 'bg-foreground' : 'bg-input'
                          )}
                        >
                          <div
                            className={cn(
                              'block h-4 w-4 rounded-full bg-background shadow-lg transition-transform',
                              !livemode
                                ? 'translate-x-4'
                                : 'translate-x-0'
                            )}
                          />
                        </div>
                      </span>
                    )}
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </div>
      </SidebarFooter>
    </>
  )
}
