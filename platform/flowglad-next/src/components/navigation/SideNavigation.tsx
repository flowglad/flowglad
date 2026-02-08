'use client'
import { BusinessOnboardingStatus } from '@db-core/enums'
import type { LucideIcon } from 'lucide-react'
import { Shapes } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
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
import { SIDEBAR_BANNER_SLIDES } from '@/config/sidebarBannerConfig'
import { useAuthContext } from '@/contexts/authContext'
import { useClickOutside } from '@/hooks/use-click-outside'
import { cn } from '@/lib/utils'
import {
  merchantSignOut,
  useMerchantSession,
} from '@/utils/authClient'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import { NavStandalone } from './NavStandalone'
import { NavUser } from './NavUser'
import { SidebarBannerCarousel } from './SidebarBannerCarousel'

type StandaloneNavItem = {
  title: string
  url: string
  icon?: LucideIcon | React.ComponentType<any>
  isActive?: boolean
}

export const SideNavigation = () => {
  const pathname = usePathname()
  const { organization } = useAuthContext()
  const { data: session } = useMerchantSession()
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const router = useRouter()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const [isLogoHovered, setIsLogoHovered] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  // Close the "More" menu when clicking outside
  const handleCloseMore = useCallback(() => setShowMore(false), [])
  useClickOutside(moreMenuRef, handleCloseMore, showMore)

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
      url: focusedMembership.data?.pricingModel?.id
        ? `/pricing-models/${focusedMembership.data.pricingModel.id}`
        : '/dashboard',
      icon: DollarSign,
      isActive: isActive('/pricing-models'),
    },
    {
      title: 'Products',
      url: '/products',
      icon: Shapes,
      isActive: isActive('/products'),
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
          'w-full flex flex-row items-center justify-start bg-sidebar transition-all duration-300 py-8',
          isCollapsed ? 'px-2.5' : 'px-2'
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

      <SidebarContent className="bg-sidebar">
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

          {/* More/Less toggle button and secondary items - wrapped for click-outside detection */}
          <div ref={moreMenuRef}>
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
        </div>
        <div className="flex-1" />
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex flex-col gap-1 transition-all duration-300 ease-in-out',
          isCollapsed ? 'px-0 py-2' : 'gap-2'
        )}
      >
        {/* Banner Carousel */}
        <SidebarBannerCarousel slides={SIDEBAR_BANNER_SLIDES} />

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
                logoURL: organization.logoURL,
              }}
              pricingModel={
                focusedMembership.data?.pricingModel
                  ? {
                      id: focusedMembership.data.pricingModel.id,
                      name: focusedMembership.data.pricingModel.name,
                      livemode:
                        focusedMembership.data.pricingModel.livemode,
                    }
                  : undefined
              }
              onSignOut={() =>
                merchantSignOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push('/sign-in')
                    },
                  },
                })
              }
            />
          )}
        </div>
      </SidebarFooter>
    </>
  )
}
