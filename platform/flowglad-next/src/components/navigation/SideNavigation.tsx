'use client'
import {
  Settings,
  Gauge,
  Store,
  Users,
  CircleDollarSign,
  BookOpen,
  Loader2,
  LogOut,
  TriangleRight,
  type LucideIcon,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/authContext'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { NavMain } from './NavMain'
import { NavStandalone } from './NavStandalone'
import { trpc } from '@/app/_trpc/client'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { Skeleton } from '../ui/skeleton'
import { FeatureFlag, BusinessOnboardingStatus } from '@/types'
import { RiDiscordFill } from '@remixicon/react'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { signOut } from '@/utils/authClient'

// Official Shadcn navigation interfaces
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
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const maybeLogo = organization?.logoURL ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <Image
      className="rounded-full object-cover h-10 w-10 bg-white"
      alt={organization?.name}
      src={organization?.logoURL}
      width={40}
      height={40}
    />
  ) : (
    <></>
  )

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

  // Navigation sections with children (using official pattern)
  const storeChildItems = [
    {
      title: 'Pricing Models',
      url: '/store/pricing-models',
    },
    {
      title: 'Products',
      url: '/store/products',
    },
    {
      title: 'Discounts',
      url: '/store/discounts',
    },
    {
      title: 'Purchases',
      url: '/store/purchases',
    },
  ]
  if (
    organization &&
    organization.featureFlags?.[FeatureFlag.Usage]
  ) {
    storeChildItems.push({
      title: 'Usage Meters',
      url: '/store/usage-meters',
    })
  }

  const navigationSections: MainNavItem[] = [
    {
      title: 'Store',
      url: '/store',
      icon: Store,
      isActive: isActive('/store'),
      items: storeChildItems,
    },
    {
      title: 'Finance',
      url: '/finance',
      icon: CircleDollarSign,
      isActive: isActive('/finance'),
      items: [
        { title: 'Payments', url: '/finance/payments' },
        { title: 'Subscriptions', url: '/finance/subscriptions' },
        { title: 'Invoices', url: '/finance/invoices' },
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
          'w-full flex flex-row items-center border-b border-muted py-3',
          isCollapsed
            ? 'justify-center px-1 gap-0'
            : 'justify-between px-1 gap-2.5 p-2'
        )}
      >
        <div
          className={cn(
            'flex items-center',
            'overflow-hidden',
            isCollapsed
              ? 'max-w-0 opacity-0'
              : 'max-w-lg opacity-100 flex-1'
          )}
        >
          <div className="flex items-center gap-3 rounded-md">
            {maybeLogo}
            <div className="flex flex-col justify-center gap-0.5 whitespace-nowrap">
              <div className="text-sm font-semibold text-foreground truncate">
                {organization?.name}
              </div>
              <div className="text-xs font-medium text-muted-foreground truncate">
                {organization?.tagline}
              </div>
            </div>
          </div>
        </div>
        <SidebarTrigger className="flex-shrink-0 text-muted-foreground" />
      </SidebarHeader>

      <SidebarContent className="pt-3">
        <div className="px-0">
          {/* 1. Set up - Only shows when onboarding not complete */}
          {setupItem.length > 0 && (
            <NavStandalone items={setupItem} />
          )}

          {/* 2. Dashboard */}
          <NavStandalone items={dashboardItem} />

          {/* 3. Customers */}
          <NavStandalone items={customersItem} />

          {/* 4. Store */}
          <NavMain items={[navigationSections[0]]} />

          {/* 5. Finance */}
          <NavMain items={[navigationSections[1]]} />

          {/* 6. Settings */}
          <NavStandalone items={settingsItem} />
        </div>
        <div className="flex-1" />
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex flex-col gap-0 px-0 overflow-hidden transition-all duration-300 ease-in-out',
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
                        livemode: !Boolean(livemode),
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
