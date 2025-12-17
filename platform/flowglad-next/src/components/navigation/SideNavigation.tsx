'use client'
import type { LucideIcon } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  CustomersIcon,
  DollarSign,
  FinishSetupIcon,
  Gauge,
  MoreIcon,
  PanelLeft,
  PanelRight,
  PaymentsIcon,
  Shapes,
  ShoppingCart,
  SubscriptionsIcon,
  Tag,
  X,
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

  const logoSize = isCollapsed ? 32 : 40

  const sidebarToggleLabel = isCollapsed
    ? 'Expand sidebar'
    : 'Collapse sidebar'

  const CollapseIcon = isCollapsed ? PanelRight : PanelLeft

  // Helper function to check if a path is active
  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + '/')
  }

  // Secondary item URLs for auto-expand detection
  const secondaryUrls = [
    '/finance/subscriptions',
    '/products',
    '/finance/discounts',
    '/finance/purchases',
  ]

  // Auto-expand when active route is in secondary items
  useEffect(() => {
    const isSecondaryActive = secondaryUrls.some((url) =>
      isActive(url)
    )
    if (isSecondaryActive) {
      setShowMore(true)
    }
  }, [pathname])

  // Onboarding setup item (conditional)
  const setupItem: StandaloneNavItem[] =
    organization?.onboardingStatus !==
    BusinessOnboardingStatus.FullyOnboarded
      ? [
          {
            title: 'Finish Setup',
            url: '/onboarding',
            icon: () => <FinishSetupIcon color="orange" />,
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
    {
      title: 'Products',
      url: '/products',
      icon: Shapes,
      isActive: isActive('/products'),
    },
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
          'w-full flex flex-row items-center bg-sidebar py-3 px-3 gap-3 transition-all duration-300',
          isCollapsed ? 'justify-center' : 'justify-start'
        )}
      >
        <button
          type="button"
          onClick={() => toggleSidebar()}
          onMouseEnter={() => setIsLogoHovered(true)}
          onMouseLeave={() => setIsLogoHovered(false)}
          className={cn(
            'relative flex-shrink-0 cursor-pointer rounded-md bg-transparent p-0 transition-colors',
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
                  'rounded-full object-cover bg-white border border-border transition-opacity duration-200',
                  isCollapsed ? 'h-8 w-8' : 'h-10 w-10',
                  isLogoHovered && 'opacity-25'
                )}
                alt={organization?.name ?? 'Organization logo'}
                src={organization.logoURL}
                width={logoSize}
                height={logoSize}
                data-testid="sidebar-org-logo"
              />
            ) : (
              <Image
                className={cn(
                  'rounded-full object-cover transition-opacity duration-200',
                  isCollapsed ? 'h-8 w-8' : 'h-10 w-10',
                  isLogoHovered && 'opacity-25'
                )}
                alt="Flowglad"
                src="/flowglad-logomark-black.svg"
                width={logoSize}
                height={logoSize}
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
      </SidebarHeader>

      <SidebarContent className="pt-3 bg-sidebar">
        <div className="px-0 bg-sidebar">
          {/* Finish Setup - Only shows when onboarding not complete */}
          {setupItem.length > 0 && (
            <NavStandalone items={setupItem} />
          )}

          {/* Primary navigation items - dimmed when showMore is true */}
          <div
            className={cn(
              showMore && 'opacity-25 transition-opacity duration-200'
            )}
          >
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
                  {showMore ? <X /> : <MoreIcon />}
                  <span>{showMore ? 'Less' : 'More'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Secondary navigation items - visible when showMore is true */}
          {showMore && <NavStandalone items={secondaryItems} />}
        </div>
        <div className="flex-1" />
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex flex-col gap-2 px-3 overflow-hidden transition-all duration-300 ease-in-out bg-sidebar',
          isCollapsed
            ? 'opacity-0 max-h-0 pointer-events-none'
            : 'opacity-100'
        )}
      >
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

        {/* NavUser - shows user info and dropdown menu */}
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
      </SidebarFooter>
    </>
  )
}
