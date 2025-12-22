'use client'
import type { LucideIcon } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  ChevronDown,
  ChevronUp,
  CustomersIcon,
  DollarSign,
  FinishSetupIcon,
  FlowgladLogomark,
  Gauge,
  PanelLeft,
  PanelRight,
  PaymentsIcon,
  ShoppingCart,
  SubscriptionsIcon,
  Tag,
} from '@/components/icons/navigation'
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
import { signOut, useSession } from '@/utils/authClient'
import { Skeleton } from '../ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import { NavStandalone } from './NavStandalone'
import { NavUser } from './NavUser'

type StandaloneNavItem = {
  title: string
  url: string
  icon?: LucideIcon | React.ComponentType<any>
  isActive?: boolean
}

export const SideNavigation = () => {
  const pathname = usePathname()
  const { organization } = useAuthContext()
  const { data: session } = useSession()
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

  const [isLogoHovered, setIsLogoHovered] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const logoSize = 24
  const orgLogoSize = 32

  const sidebarToggleLabel = isCollapsed
    ? 'Expand sidebar'
    : 'Collapse sidebar'

  const CollapseIcon = isCollapsed ? PanelRight : PanelLeft

  // Helper function to check if a path is active
  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + '/')
  }

  // Secondary item URLs for detection
  const secondaryUrls = [
    '/finance/subscriptions',
    '/products',
    '/finance/discounts',
    '/finance/purchases',
  ]

  // Onboarding setup item (conditional)
  const setupItem: StandaloneNavItem[] =
    organization?.onboardingStatus !==
    BusinessOnboardingStatus.FullyOnboarded
      ? [
          {
            title: 'Finish Setup',
            url: '/onboarding',
            icon: () => (
              <FinishSetupIcon className="text-yellow-500" />
            ),
            isActive: isActive('/onboarding'),
          },
        ]
      : []

  // Primary navigation items (always visible)
  const primaryItems: StandaloneNavItem[] = [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: Gauge,
      isActive: isActive('/dashboard'),
    },
    {
      title: 'Pricing',
      url: '/pricing-models',
      icon: DollarSign,
      isActive: isActive('/pricing-models'),
    },
    {
      title: 'Customers',
      url: '/customers',
      icon: CustomersIcon,
      isActive: isActive('/customers'),
    },
    {
      title: 'Payments',
      url: '/finance',
      icon: PaymentsIcon,
      isActive:
        isActive('/finance') &&
        !secondaryUrls.some((url) => isActive(url)),
    },
  ]

  // Secondary navigation items (visible when showMore is true)
  const secondaryItems: StandaloneNavItem[] = [
    {
      title: 'Subscriptions',
      url: '/finance/subscriptions',
      icon: SubscriptionsIcon,
      isActive: isActive('/finance/subscriptions'),
    },
    // TODO: Reintroduce Products menu item after the product page is created
    // {
    //   title: 'Products',
    //   url: '/products',
    //   icon: Shapes,
    //   isActive: isActive('/products'),
    // },
    {
      title: 'Discounts',
      url: '/finance/discounts',
      icon: Tag,
      isActive: isActive('/finance/discounts'),
    },
    {
      title: 'Purchases',
      url: '/finance/purchases',
      icon: ShoppingCart,
      isActive: isActive('/finance/purchases'),
    },
  ]

  return (
    <>
      <SidebarHeader
        className={cn(
          'w-full flex flex-row items-center justify-start bg-sidebar transition-all duration-300 py-2',
          isCollapsed
            ? organization?.logoURL
              ? 'px-[3px]'
              : 'px-[5px]'
            : 'px-1'
        )}
      >
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => toggleSidebar()}
                onMouseEnter={() => setIsLogoHovered(true)}
                onMouseLeave={() => setIsLogoHovered(false)}
                className={cn(
                  'relative flex-shrink-0 cursor-pointer rounded-full bg-transparent transition-all',
                  isCollapsed ? 'p-0.5' : 'p-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
                aria-label={sidebarToggleLabel}
                data-testid="sidebar-logo-button"
              >
                <div className="relative">
                  {/* Logo - Show org logo if available, otherwise Flowglad logo */}
                  {organization?.logoURL ? (
                    <Image
                      className={cn(
                        'h-8 w-8 rounded-full object-cover transition-opacity duration-200',
                        isLogoHovered && 'opacity-0'
                      )}
                      alt={organization?.name ?? 'Organization logo'}
                      src={organization.logoURL}
                      width={orgLogoSize}
                      height={orgLogoSize}
                      data-testid="sidebar-org-logo"
                    />
                  ) : (
                    <FlowgladLogomark
                      className={cn(
                        'transition-opacity duration-200',
                        isLogoHovered && 'opacity-0'
                      )}
                      size={logoSize}
                      data-testid="sidebar-flowglad-logo"
                    />
                  )}
                  {/* Collapse/Expand icon overlay on hover */}
                  <div
                    className={cn(
                      'absolute inset-0 flex items-center justify-center transition-opacity duration-200',
                      isLogoHovered ? 'opacity-100' : 'opacity-0'
                    )}
                    data-testid="sidebar-collapse-icon"
                  >
                    <CollapseIcon className="text-foreground" />
                  </div>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? 'Open sidebar' : 'Close sidebar'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </SidebarHeader>

      <SidebarContent className="pt-3 bg-sidebar">
        <div className="px-0 bg-sidebar">
          {/* Finish Setup and Primary navigation items - dimmed when showMore is true */}
          <div
            className={cn(
              'transition-opacity duration-200',
              showMore && 'opacity-25'
            )}
          >
            {/* Finish Setup - Only shows when onboarding not complete */}
            {setupItem.length > 0 && (
              <NavStandalone items={setupItem} />
            )}

            {/* Primary navigation items */}
            <NavStandalone items={primaryItems} />
          </div>

          {/* More/Less toggle button */}
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setShowMore(!showMore)}
                  tooltip={showMore ? 'Less' : 'More'}
                  data-testid="more-less-toggle"
                >
                  {showMore ? <ChevronUp /> : <ChevronDown />}
                  <span>{showMore ? 'Less' : 'More'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Secondary navigation items - visible when showMore is true */}
          {showMore && (
            <NavStandalone items={secondaryItems} indented />
          )}
        </div>
        <div className="flex-1" />
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex flex-col gap-1 transition-all duration-300 ease-in-out',
          isCollapsed ? 'px-0 py-2' : 'gap-2'
        )}
      >
        {/* Test Mode Toggle - using official sidebar components */}
        <div
          className={cn('px-0', isCollapsed && 'flex justify-start')}
        >
          <SidebarGroup className={cn(isCollapsed && 'p-0')}>
            <SidebarMenu>
              <SidebarMenuItem>
                {initialFocusedMembershipLoading ? (
                  <Skeleton
                    className={cn(
                      'rounded-md',
                      isCollapsed ? 'w-9 h-5' : 'w-full h-8'
                    )}
                  />
                ) : isCollapsed ? (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={async () => {
                            await toggleTestMode.mutateAsync({
                              livemode: !livemode,
                            })
                          }}
                          disabled={
                            toggleTestMode.isPending ||
                            focusedMembership.isPending
                          }
                          className={cn(
                            'flex w-full items-center justify-center rounded-md transition-colors',
                            'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            'px-[7px] py-1.5 disabled:opacity-50'
                          )}
                          aria-label="Toggle test mode"
                          data-testid="test-mode-toggle-collapsed"
                        >
                          <div
                            className={cn(
                              'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-sm transition-colors cursor-pointer',
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
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {!livemode
                          ? 'Deactivate Test Mode'
                          : 'Activate Test Mode'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                    <span className="transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap max-w-xs opacity-100 truncate">
                      Test Mode
                    </span>
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
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </div>

        {/* NavUser - shows user info and dropdown menu */}
        <div className={cn(isCollapsed && 'flex justify-start')}>
          {session?.user && organization && (
            <NavUser
              user={{
                name: session.user.name ?? session.user.email,
                email: session.user.email,
                image: session.user.image,
              }}
              organization={{
                id: organization.id,
                name: organization.name,
                onboardingStatus: organization.onboardingStatus,
              }}
              onSignOut={() => signOut()}
              onTestModeToggle={async (enabled) => {
                await toggleTestMode.mutateAsync({
                  livemode: !enabled,
                })
              }}
              testModeEnabled={!livemode}
            />
          )}
        </div>
      </SidebarFooter>
    </>
  )
}
