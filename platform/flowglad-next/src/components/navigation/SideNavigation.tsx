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
} from 'lucide-react'
import { useAuthContext } from '@/contexts/authContext'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import OnboardingNavigationSection from './OnboardingNavigationSection'
import ParentChildNavigationItem from './ParentChildNavigationItem'
import StandaloneNavigationItem from './StandaloneNavigationItem'
import { trpc } from '@/app/_trpc/client'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { Skeleton } from '../ui/skeleton'
import { FeatureFlag } from '@/types'
import { RiDiscordFill } from '@remixicon/react'
import {
  SidebarContent,
  SidebarFooter,
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
  const storeChildItems = [
    {
      label: 'Pricing Models',
      href: '/store/pricing-models',
    },
    {
      label: 'Products',
      href: '/store/products',
    },
    {
      label: 'Discounts',
      href: '/store/discounts',
    },
    {
      label: 'Purchases',
      href: '/store/purchases',
    },
  ]
  if (
    organization &&
    organization.featureFlags?.[FeatureFlag.Usage]
  ) {
    storeChildItems.push({
      label: 'Usage Meters',
      href: '/store/usage-meters',
    })
  }

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
        <SidebarMenu
          className={cn(
            'flex flex-col gap-0',
            isCollapsed ? 'px-0 items-center' : 'px-2 w-full'
          )}
        >
          <OnboardingNavigationSection isCollapsed={isCollapsed} />
          <StandaloneNavigationItem
            title="Dashboard"
            href="/dashboard"
            icon={<Gauge size={16} strokeWidth={1.5} />}
            basePath="/dashboard"
            isCollapsed={isCollapsed}
          />
          <StandaloneNavigationItem
            title="Customers"
            href="/customers"
            icon={<Users size={16} strokeWidth={1.5} />}
            basePath="/customers"
            isCollapsed={isCollapsed}
          />
          <ParentChildNavigationItem
            parentLabel="Store"
            parentLeadingIcon={<Store size={16} strokeWidth={1.5} />}
            childItems={storeChildItems}
            basePath="/store"
            isCollapsed={isCollapsed}
          />
          <ParentChildNavigationItem
            parentLabel="Finance"
            parentLeadingIcon={
              <CircleDollarSign size={16} strokeWidth={1.5} />
            }
            childItems={[
              { label: 'Payments', href: '/finance/payments' },
              {
                label: 'Subscriptions',
                href: '/finance/subscriptions',
              },
              { label: 'Invoices', href: '/finance/invoices' },
            ]}
            basePath="/finance"
            isCollapsed={isCollapsed}
          />
          <StandaloneNavigationItem
            title="Settings"
            href="/settings"
            icon={<Settings size={16} strokeWidth={1.5} />}
            basePath="/settings"
            isCollapsed={isCollapsed}
          />
        </SidebarMenu>
        <div className="flex-1" />
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex flex-col gap-0 overflow-hidden transition-all duration-300 ease-in-out',
          isCollapsed
            ? 'opacity-0 max-h-0 pointer-events-none'
            : 'opacity-100'
        )}
      >
        <SidebarMenu
          className={cn(
            isCollapsed ? 'px-0 items-center' : 'px-0 w-full'
          )}
        >
          <StandaloneNavigationItem
            title="Discord"
            href="https://app.flowglad.com/invite-discord"
            icon={<RiDiscordFill size={16} strokeWidth={1.5} />}
            basePath="https://app.flowglad.com/invite-discord"
            isCollapsed={isCollapsed}
          />
          <StandaloneNavigationItem
            title="Documentation"
            href="https://docs.flowglad.com"
            icon={<BookOpen size={16} strokeWidth={1.5} />}
            basePath="https://docs.flowglad.com"
            isCollapsed={isCollapsed}
          />
          <StandaloneNavigationItem
            title="Logout"
            href="/logout"
            icon={<LogOut size={16} strokeWidth={1.5} />}
            basePath="/logout"
            isCollapsed={isCollapsed}
          />
        </SidebarMenu>
        <SidebarMenu
          className={cn(
            isCollapsed ? 'px-0 items-center' : 'px-0 w-full'
          )}
        >
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
                className={cn(
                  'group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center'
                )}
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
      </SidebarFooter>
    </>
  )
}
